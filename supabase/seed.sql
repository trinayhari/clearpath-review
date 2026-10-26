-- Fictional workspace. No shared identities or passwords are created.
insert into public.cp_workspaces(id,name) values ('00000000-0000-4000-8000-000000000001','ClearPath Financial • evaluator') on conflict do nothing;
-- A project administrator provisions each evaluator membership AFTER that person
-- signs in with their own Supabase identity. See README for the exact SQL.
