-- Teams are administered by their creator; administration never grants review rights.
alter table public.cp_workspaces add column owner_id uuid references auth.users(id);
update public.cp_workspaces w set owner_id=p.user_id from private.cp_personal_workspaces p where p.workspace_id=w.id;
alter table public.cp_campaigns add column reviewer_id uuid references auth.users(id);
create table private.cp_team_invites (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.cp_workspaces(id),
 token_hash text not null unique, role text not null check(role in ('marketer','reviewer')),
 created_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id), revoked boolean not null default false
);
alter table private.cp_team_invites enable row level security;
revoke all on private.cp_team_invites from public,anon,authenticated;
create function private.cp_team_command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; invite private.cp_team_invites; token text; chosen_role text; label text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 perform 1 from auth.users where id=actor and coalesce(is_anonymous,false)=false;
 if not found then raise exception 'Authenticated account required'; end if;
 if p_action='create' then
  label:=trim(coalesce(p_data->>'name',''));
  if length(label) not between 2 and 80 then raise exception 'Team name must be 2 to 80 characters'; end if;
  chosen_role:=coalesce(p_data->>'role','marketer');
  if chosen_role not in ('marketer','reviewer') then raise exception 'Invalid team role'; end if;
  if length(trim(coalesce(p_data->>'displayName',''))) not between 2 and 80 then raise exception 'Display name must be 2 to 80 characters'; end if;
  insert into public.cp_workspaces(name,owner_id) values(label,actor) returning id into target;
  insert into public.cp_members values(target,actor,chosen_role,trim(p_data->>'displayName'));
  return jsonb_build_object('workspaceId',target);
 elsif p_action='join' then
  token:=p_data->>'token';
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Invite is invalid, expired or already used'; end if;
  if length(trim(coalesce(p_data->>'displayName',''))) not between 2 and 80 then raise exception 'Display name must be 2 to 80 characters'; end if;
  select * into invite from private.cp_team_invites where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if invite.id is null or invite.revoked or invite.expires_at<=now() or invite.accepted_by is not null then raise exception 'Invite is invalid, expired or already used'; end if;
  if exists(select 1 from public.cp_members where workspace_id=invite.workspace_id and user_id=actor) then raise exception 'You already belong to this team'; end if;
  if not exists(select 1 from public.cp_workspaces w join public.cp_members m on m.workspace_id=w.id and m.user_id=w.owner_id where w.id=invite.workspace_id and w.owner_id=invite.created_by) then raise exception 'Invite is invalid, expired or already used'; end if;
  insert into public.cp_members values(invite.workspace_id,actor,invite.role,trim(p_data->>'displayName'));
  update private.cp_team_invites set accepted_by=actor where id=invite.id;
  return jsonb_build_object('workspaceId',invite.workspace_id);
 elsif p_action in ('invite','rename','revoke') then
  target:=(p_data->>'workspaceId')::uuid;
  perform 1 from public.cp_workspaces w join public.cp_members m on m.workspace_id=w.id and m.user_id=actor where w.id=target and w.owner_id=actor for update of w;
  if not found then raise exception 'Team owner required'; end if;
  if p_action='rename' then
   label:=trim(coalesce(p_data->>'name',''));
   if length(label) not between 2 and 80 then raise exception 'Team name must be 2 to 80 characters'; end if;
   update public.cp_workspaces set name=label where id=target;
  elsif p_action='revoke' then
   update private.cp_team_invites set revoked=true where id=(p_data->>'inviteId')::uuid and workspace_id=target;
   if not found then raise exception 'Invite not found'; end if;
  else
   chosen_role:=p_data->>'role';
   if chosen_role is null or chosen_role not in ('marketer','reviewer') then raise exception 'Invalid team role'; end if;
   token:=encode(extensions.gen_random_bytes(32),'hex');
   insert into private.cp_team_invites(workspace_id,token_hash,role,created_by) values(target,encode(extensions.digest(token,'sha256'),'hex'),chosen_role,actor) returning * into invite;
   return jsonb_build_object('id',invite.id,'token',token,'expiresAt',invite.expires_at,'role',invite.role);
  end if;
  return jsonb_build_object('workspaceId',target);
 else raise exception 'Unknown action'; end if;
end $$;
revoke all on function private.cp_team_command(text,jsonb) from public,anon;
grant execute on function private.cp_team_command(text,jsonb) to authenticated;
create function public.cp_team_command(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.cp_team_command(p_action,p_data) $$;
revoke all on function public.cp_team_command(text,jsonb) from public,anon;
grant execute on function public.cp_team_command(text,jsonb) to authenticated;

create or replace function private.cp_initialize_workspace() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  -- The Auth row lock serializes parallel initialization for this identity.
  -- is_anonymous is Auth-owned; user_metadata is never consulted.
  perform 1 from auth.users where id = actor and coalesce(is_anonymous, false) = false for update;
  if not found then raise exception 'Authenticated account required'; end if;
  select workspace_id into target from private.cp_personal_workspaces where user_id = actor;
  if target is not null then
    if not exists (select 1 from public.cp_members where workspace_id = target and user_id = actor) then
      raise exception 'Workspace access denied';
    end if;
    return target;
  end if;
  -- Preserve approved existing memberships; onboarding cannot elevate or replace them.
  select workspace_id into target from public.cp_members where user_id = actor order by workspace_id limit 1;
  if target is not null then return target; end if;
  insert into public.cp_workspaces(name,owner_id) values ('My team',actor) returning id into target;
  insert into public.cp_members(workspace_id,user_id,role,display_name)
    values (target,actor,'marketer','Workspace owner');
  insert into private.cp_personal_workspaces(user_id,workspace_id) values (actor,target);
  return target;
end $$;

create or replace function private.cp_command(p_action text, p_campaign uuid, p_version uuid, p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns; m public.cp_members; v public.cp_versions; new_id uuid; f jsonb; assigned uuid; reviewer_count integer; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_action='create' then
 select * into m from public.cp_members where user_id=auth.uid() and workspace_id=(p_data->>'workspaceId')::uuid;
 if m.role is distinct from 'marketer' then raise exception 'Marketer membership required'; end if;
 insert into public.cp_campaigns(workspace_id,owner_id,title,product,channel) values(m.workspace_id,auth.uid(),trim(p_data->>'title'),p_data->>'product',p_data->>'channel') returning * into c;
 insert into public.cp_versions(campaign_id,number,content) values(c.id,1,trim(p_data->>'content')) returning * into v;
 update public.cp_campaigns set current_version=v.id where id=c.id;
 else
 select * into c from public.cp_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'Campaign not found'; end if;
 select * into m from public.cp_members where user_id=auth.uid() and workspace_id=c.workspace_id;
 if m.user_id is null then raise exception 'Workspace access denied'; end if;
 if c.current_version is distinct from p_version then raise exception 'Stale version. Refresh before continuing.'; end if;
 select * into v from public.cp_versions where id=p_version and campaign_id=c.id;
 if p_action in ('approve','reject','request_changes') then
 if m.role<>'reviewer' or c.owner_id=auth.uid() then raise exception 'Independent reviewer required'; end if;
 if c.reviewer_id is distinct from auth.uid() then raise exception 'Assigned reviewer required'; end if;
 if c.status<>'In review' then raise exception 'Only a submitted version can be decided'; end if;
 if p_action='approve' and not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and (provider='deterministic-mock-v2-db' or (provider='openai-responses-v1' and execution_id is not null))) then raise exception 'Trusted precheck required before approval'; end if;
 if length(trim(coalesce(p_data->>'note','')))<3 then raise exception 'Decision rationale required'; end if;
 update public.cp_campaigns set status=case p_action when 'approve' then 'Approved' when 'reject' then 'Rejected' else 'Changes requested' end,decided_at=now(),updated_at=now() where id=c.id;
 elsif p_action='assign' then
 if c.owner_id<>auth.uid() and not exists(select 1 from public.cp_workspaces where id=c.workspace_id and owner_id=auth.uid()) then raise exception 'Campaign owner or team owner required'; end if;
 if c.status not in ('Draft','In review','Changes requested') then raise exception 'Campaign is locked'; end if;
 assigned:=(p_data->>'reviewerId')::uuid;
 if assigned is null or assigned=c.owner_id or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=assigned and role='reviewer') then raise exception 'Choose a compliance reviewer from this team'; end if;
 update public.cp_campaigns set reviewer_id=assigned,updated_at=now() where id=c.id;
 p_data:=jsonb_build_object('note','Assigned reviewer: '||assigned::text);
 elsif p_action='comment' then
 if length(trim(coalesce(p_data->>'note','')))<1 then raise exception 'Comment required'; end if;
 elsif p_action in ('revise','analyze','submit') then
 if m.role<>'marketer' or c.owner_id<>auth.uid() then raise exception 'Campaign owner required'; end if;
 if c.status='In review' or (c.status in ('Approved','Rejected') and p_action<>'revise') then raise exception 'Campaign is locked'; end if;
 if p_action='revise' then
 insert into public.cp_versions(campaign_id,number,content) values(c.id,v.number+1,trim(p_data->>'content')) returning * into v;
 update public.cp_campaigns set current_version=v.id,status='Draft',updated_at=now(),submitted_at=null,decided_at=null where id=c.id;
 elsif p_action='analyze' then
 if p_data ? 'findings' then raise exception 'Client-supplied findings are not accepted'; end if;
 if exists(select 1 from private.cp_ai_runs where version_id=v.id) then raise exception 'External analysis owns this version. Create a revision before running mock analysis.'; end if;
 insert into public.cp_analyses(version_id,findings,trusted) values(v.id,private.cp_mock_analysis(v.content,c.product),true);
 elsif p_action='submit' then
 if not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and (provider='deterministic-mock-v2-db' or (provider='openai-responses-v1' and execution_id is not null))) then raise exception 'Trusted precheck required. Create a revision if a legacy assessment exists.'; end if;
 if exists(select 1 from public.cp_events where version_id=v.id and action in ('approve','reject','request_changes')) then raise exception 'Create a revised version before resubmitting'; end if;
 assigned:=coalesce((p_data->>'reviewerId')::uuid,c.reviewer_id);
 if assigned is null then
  select count(*),(array_agg(user_id))[1] into reviewer_count,assigned from public.cp_members where workspace_id=c.workspace_id and role='reviewer' and user_id<>c.owner_id;
  if reviewer_count<>1 then raise exception 'Choose a compliance reviewer from this team'; end if;
 end if;
 if assigned=c.owner_id or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=assigned and role='reviewer') then raise exception 'Choose a compliance reviewer from this team'; end if;
 update public.cp_campaigns set status='In review',reviewer_id=assigned,submitted_at=now(),updated_at=now() where id=c.id;
 p_data:=jsonb_build_object('note','Submitted to reviewer: '||assigned::text);
 end if;
 else raise exception 'Unknown action'; end if;
 end if;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),p_action,p_data->>'note');
 return c.id;
end $$;
