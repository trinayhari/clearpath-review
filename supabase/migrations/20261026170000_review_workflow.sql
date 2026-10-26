create schema if not exists private;
revoke all on schema private from public;
create table public.cp_workspaces(id uuid primary key default gen_random_uuid(), name text not null);
create table public.cp_members(workspace_id uuid references public.cp_workspaces(id), user_id uuid references auth.users(id), role text not null check(role in ('marketer','reviewer')), display_name text not null, primary key(workspace_id,user_id));
create table public.cp_campaigns(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.cp_workspaces(id), owner_id uuid not null references auth.users(id), title text not null check(length(title) between 3 and 160), product text not null check(product in ('Personal loans','Credit cards','Mortgage','Affiliate')), channel text not null check(channel in ('Email','Landing page','Social','Paid search')), status text not null default 'Draft' check(status in ('Draft','In review','Changes requested','Approved','Rejected')), current_version uuid, updated_at timestamptz not null default now(), submitted_at timestamptz, decided_at timestamptz);
create table public.cp_versions(id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.cp_campaigns(id), number integer not null, content text not null check(length(content) between 20 and 20000), created_at timestamptz not null default now(), unique(campaign_id,number));
alter table public.cp_campaigns add constraint current_version_fk foreign key(current_version) references public.cp_versions(id);
create table public.cp_analyses(version_id uuid primary key references public.cp_versions(id), findings jsonb not null, provider text not null default 'deterministic-mock-v1' check(provider='deterministic-mock-v1'), created_at timestamptz not null default now());
create table public.cp_events(id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.cp_campaigns(id), version_id uuid not null references public.cp_versions(id), actor_id uuid not null references auth.users(id), action text not null, note text check(length(note)<=4000), created_at timestamptz not null default now());
create unique index one_decision_per_version on public.cp_events(version_id) where action in ('approve','reject','request_changes');
create index cp_campaign_workspace on public.cp_campaigns(workspace_id);
create index cp_versions_campaign on public.cp_versions(campaign_id);
create index cp_events_campaign on public.cp_events(campaign_id);
create index cp_members_user on public.cp_members(user_id);
create or replace function private.cp_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.cp_members where workspace_id=w and user_id=auth.uid()) $$;
revoke all on function private.cp_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.cp_member(uuid) to authenticated;
alter table public.cp_workspaces enable row level security;
alter table public.cp_members enable row level security;
alter table public.cp_campaigns enable row level security;
alter table public.cp_versions enable row level security;
alter table public.cp_analyses enable row level security;
alter table public.cp_events enable row level security;
create policy member_read on public.cp_workspaces for select to authenticated using (private.cp_member(id));
create policy member_read on public.cp_members for select to authenticated using (private.cp_member(workspace_id));
create policy member_read on public.cp_campaigns for select to authenticated using (private.cp_member(workspace_id));
create policy member_read on public.cp_versions for select to authenticated using (exists(select 1 from public.cp_campaigns c where c.id=campaign_id));
create policy member_read on public.cp_analyses for select to authenticated using (exists(select 1 from public.cp_versions v where v.id=version_id));
create policy member_read on public.cp_events for select to authenticated using (exists(select 1 from public.cp_campaigns c where c.id=campaign_id));
revoke all on public.cp_workspaces, public.cp_members, public.cp_campaigns, public.cp_versions, public.cp_analyses, public.cp_events from anon, authenticated;
grant select on public.cp_workspaces, public.cp_members, public.cp_campaigns, public.cp_versions, public.cp_analyses, public.cp_events to authenticated;
create function private.cp_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Immutable record'; end $$;
create trigger versions_immutable before update or delete on public.cp_versions for each row execute function private.cp_immutable();
create trigger events_immutable before update or delete on public.cp_events for each row execute function private.cp_immutable();
create trigger analyses_immutable before update or delete on public.cp_analyses for each row execute function private.cp_immutable();
create function private.cp_command(p_action text, p_campaign uuid, p_version uuid, p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns; m public.cp_members; v public.cp_versions; new_id uuid; f jsonb; begin
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
 if c.status<>'In review' then raise exception 'Only a submitted version can be decided'; end if;
 if length(trim(coalesce(p_data->>'note','')))<3 then raise exception 'Decision rationale required'; end if;
 update public.cp_campaigns set status=case p_action when 'approve' then 'Approved' when 'reject' then 'Rejected' else 'Changes requested' end,decided_at=now(),updated_at=now() where id=c.id;
 elsif p_action='comment' then
 if length(trim(coalesce(p_data->>'note','')))<1 then raise exception 'Comment required'; end if;
 elsif p_action in ('revise','analyze','submit') then
 if m.role<>'marketer' or c.owner_id<>auth.uid() then raise exception 'Campaign owner required'; end if;
 if c.status='In review' or (c.status in ('Approved','Rejected') and p_action<>'revise') then raise exception 'Campaign is locked'; end if;
 if p_action='revise' then
 insert into public.cp_versions(campaign_id,number,content) values(c.id,v.number+1,trim(p_data->>'content')) returning * into v;
 update public.cp_campaigns set current_version=v.id,status='Draft',updated_at=now(),submitted_at=null,decided_at=null where id=c.id;
 elsif p_action='analyze' then
 if jsonb_typeof(p_data->'findings') is distinct from 'array' or jsonb_array_length(p_data->'findings')>30 then raise exception 'Invalid findings'; end if;
 for f in select value from jsonb_array_elements(p_data->'findings') loop
 if coalesce(length(f->>'evidence'),0)=0 or strpos(v.content,f->>'evidence')=0 or (f->>'policyId') not in ('CP-101','CP-204','CP-310','CP-420','CP-501') or coalesce(f->>'policyId','')='' or coalesce(f->>'severity','')='' or (f->>'policyId'='CP-310' and c.product<>'Mortgage') or (f->>'policyId'='CP-420' and c.product<>'Affiliate') or (f->>'severity') not in ('High','Medium','Low') then raise exception 'Invalid finding evidence'; end if;
 end loop;
 insert into public.cp_analyses(version_id,findings) values(v.id,p_data->'findings');
 elsif p_action='submit' then
 if not exists(select 1 from public.cp_analyses where version_id=v.id) then raise exception 'Precheck required'; end if;
 if exists(select 1 from public.cp_events where version_id=v.id and action in ('approve','reject','request_changes')) then raise exception 'Create a revised version before resubmitting'; end if;
 update public.cp_campaigns set status='In review',submitted_at=now(),updated_at=now() where id=c.id;
 end if;
 else raise exception 'Unknown action'; end if;
 end if;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),p_action,p_data->>'note');
 return c.id;
end $$;
revoke all on function private.cp_command(text,uuid,uuid,jsonb) from public;
grant execute on function private.cp_command(text,uuid,uuid,jsonb) to authenticated;
create function public.cp_command(p_action text,p_campaign uuid default null,p_version uuid default null,p_data jsonb default '{}') returns uuid language sql security invoker set search_path='' as $$ select private.cp_command(p_action,p_campaign,p_version,p_data) $$;
revoke all on function public.cp_command(text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.cp_command(text,uuid,uuid,jsonb) to authenticated;
revoke all on function private.cp_immutable() from public;
