-- Review lifecycle is separate from compliance status. Trash is recoverable;
-- versions, assessments and decision history remain immutable.
alter table public.cp_campaigns
  add column lifecycle text not null default 'open' check (lifecycle in ('open','closed')),
  add column closed_at timestamptz,
  add column deleted_at timestamptz;

-- Keep the existing workflow implementation intact, but remove its direct grants
-- so authenticated callers cannot bypass the lifecycle gate.
alter function private.cp_command(text,uuid,uuid,jsonb) rename to cp_workflow_command;
revoke all on function private.cp_workflow_command(text,uuid,uuid,jsonb) from public,anon,authenticated;

create function private.cp_command(p_action text,p_campaign uuid,p_version uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns; actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_action='create' then
  return private.cp_workflow_command(p_action,p_campaign,p_version,p_data);
 end if;
 select * into c from public.cp_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'Campaign not found'; end if;
 if not private.cp_member(c.workspace_id) then raise exception 'Workspace access denied'; end if;
 if c.current_version is distinct from p_version then raise exception 'Stale version. Refresh before continuing.'; end if;
 if p_action in ('close','reopen','delete','restore') then
  if c.owner_id<>actor and not exists(select 1 from public.cp_workspaces where id=c.workspace_id and owner_id=actor) then
   raise exception 'Review owner or team owner required';
  end if;
  if p_action='restore' then
   if c.deleted_at is null then raise exception 'Review is not in Trash'; end if;
   update public.cp_campaigns set deleted_at=null,updated_at=clock_timestamp() where id=c.id;
  else
   if c.deleted_at is not null then raise exception 'Review is in Trash. Restore it first.'; end if;
   if p_action in ('close','delete') and exists(
    select 1 from private.cp_ai_runs where campaign_id=c.id and state in ('reserved','running') and expires_at>clock_timestamp()
   ) then raise exception 'Analysis is in progress. Try again when it finishes.'; end if;
   if p_action='close' then
    if c.lifecycle='closed' then raise exception 'Review is already closed'; end if;
    update public.cp_campaigns set lifecycle='closed',closed_at=clock_timestamp(),updated_at=clock_timestamp() where id=c.id;
   elsif p_action='reopen' then
    if c.lifecycle<>'closed' then raise exception 'Review is already open'; end if;
    update public.cp_campaigns set lifecycle='open',closed_at=null,updated_at=clock_timestamp() where id=c.id;
   else
    update public.cp_campaigns set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=c.id;
   end if;
  end if;
  insert into public.cp_events(campaign_id,version_id,actor_id,action,note)
   values(c.id,c.current_version,actor,p_action,nullif(trim(p_data->>'note'),''));
  return c.id;
 end if;
 if c.deleted_at is not null then raise exception 'Review is in Trash. Restore it first.'; end if;
 if c.lifecycle='closed' and p_action<>'comment' then raise exception 'Review is closed. Reopen it first.'; end if;
 return private.cp_workflow_command(p_action,p_campaign,p_version,p_data);
end $$;
revoke all on function private.cp_command(text,uuid,uuid,jsonb) from public,anon;
grant execute on function private.cp_command(text,uuid,uuid,jsonb) to authenticated;
create or replace function public.cp_command(p_action text,p_campaign uuid default null,p_version uuid default null,p_data jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$ select private.cp_command(p_action,p_campaign,p_version,p_data) $$;

-- All provider reservation/start/finalize writes share the same campaign lock.
-- This also covers direct signed RPCs, not merely the HTTP action handler.
create function private.cp_ai_lifecycle_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns;
begin
 select * into c from public.cp_campaigns where id=new.campaign_id for update;
 if c.deleted_at is not null then raise exception 'Review is in Trash. Restore it first.'; end if;
 if c.lifecycle='closed' then raise exception 'Review is closed. Reopen it first.'; end if;
 return new;
end $$;
revoke all on function private.cp_ai_lifecycle_guard() from public,anon,authenticated;
create trigger cp_ai_lifecycle_guard before insert or update on private.cp_ai_runs
for each row execute function private.cp_ai_lifecycle_guard();
