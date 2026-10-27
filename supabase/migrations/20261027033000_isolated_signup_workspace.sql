-- Password-only take-home onboarding. No email/domain/user_metadata authorization.
create table private.cp_personal_workspaces (
  user_id uuid primary key references auth.users(id),
  workspace_id uuid not null unique references public.cp_workspaces(id),
  created_at timestamptz not null default now()
);
alter table private.cp_personal_workspaces enable row level security;
revoke all on private.cp_personal_workspaces from public, anon, authenticated;
create trigger personal_workspace_immutable before update or delete on private.cp_personal_workspaces for each row execute function private.cp_immutable();

create function private.cp_initialize_workspace() returns uuid
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
  insert into public.cp_workspaces(name) values ('My workspace') returning id into target;
  insert into public.cp_members(workspace_id,user_id,role,display_name)
    values (target,actor,'marketer','Workspace owner');
  insert into private.cp_personal_workspaces(user_id,workspace_id) values (actor,target);
  return target;
end $$;
revoke all on function private.cp_initialize_workspace() from public, anon;
grant execute on function private.cp_initialize_workspace() to authenticated;
create function public.cp_initialize_workspace() returns uuid
language sql security invoker set search_path = '' as $$ select private.cp_initialize_workspace() $$;
revoke all on function public.cp_initialize_workspace() from public, anon;
grant execute on function public.cp_initialize_workspace() to authenticated;
