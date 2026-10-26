-- Authorized isolated transaction: synthetic identity IDs only, no credentials,
-- emails, identities, sessions, or invitations. ROLLBACK removes every fixture.
begin;
set local statement_timeout = '15s';
create temporary table cp_verify_context(wid uuid, marketer uuid, reviewer uuid, outsider uuid, cid uuid, v1 uuid, v2 uuid);
insert into cp_verify_context values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,null);
grant select,update on cp_verify_context to authenticated;
insert into auth.users(id) select marketer from cp_verify_context union all select reviewer from cp_verify_context union all select outsider from cp_verify_context;
insert into public.cp_workspaces(id,name) select wid,'Rollback-only verification' from cp_verify_context;
insert into public.cp_members(workspace_id,user_id,role,display_name) select wid,marketer,'marketer','Rollback marketer' from cp_verify_context union all select wid,reviewer,'reviewer','Rollback reviewer' from cp_verify_context;
select set_config('request.jwt.claim.sub',(select marketer::text from cp_verify_context),true);
set local role authenticated;
update cp_verify_context set cid=public.cp_command('create',null,null,jsonb_build_object('workspaceId',wid,'title','Rollback verification campaign','product','Personal loans','channel','Email','content','Get guaranteed approval for a personal loan today. Explore your options.'));
update cp_verify_context set v1=(select current_version from public.cp_campaigns where id=cid);
do $$begin
 begin perform public.cp_command('analyze',cid,v1,'{"findings":[]}'::jsonb) from cp_verify_context;raise exception 'FAIL: forged assessment accepted';exception when others then if sqlerrm not like '%Client-supplied findings%' then raise;end if;end;
end$$;
select public.cp_command('analyze',cid,v1,'{}') from cp_verify_context;
do $$begin if not exists(select 1 from public.cp_analyses a join cp_verify_context x on a.version_id=x.v1 where a.trusted and a.findings->0->>'policyId'='CP-101') then raise exception 'FAIL: trusted generated finding missing';end if;end$$;
select public.cp_command('submit',cid,v1,'{}') from cp_verify_context;
select set_config('request.jwt.claim.sub',(select reviewer::text from cp_verify_context),true);
select public.cp_command('request_changes',cid,v1,'{"note":"Remove unsupported approval claim."}') from cp_verify_context;
select set_config('request.jwt.claim.sub',(select marketer::text from cp_verify_context),true);
select public.cp_command('revise',cid,v1,'{"content":"Explore personal loan options. Subject to eligibility and credit approval."}') from cp_verify_context;
update cp_verify_context set v2=(select current_version from public.cp_campaigns where id=cid);
select public.cp_command('analyze',cid,v2,'{}') from cp_verify_context;
select public.cp_command('submit',cid,v2,'{}') from cp_verify_context;
select set_config('request.jwt.claim.sub',(select reviewer::text from cp_verify_context),true);
do $$begin
 begin perform public.cp_command('approve',cid,v1,'{"note":"Stale review"}') from cp_verify_context;raise exception 'FAIL: stale approval accepted';exception when others then if sqlerrm not like '%Stale version%' then raise;end if;end;
end$$;
select public.cp_command('approve',cid,v2,'{"note":"Verified revised wording and eligibility conditions."}') from cp_verify_context;
do $$begin if not exists(select 1 from public.cp_campaigns c join cp_verify_context x on c.id=x.cid where c.status='Approved' and c.current_version=x.v2) then raise exception 'FAIL: approval missing';end if;end$$;
select set_config('request.jwt.claim.sub',(select outsider::text from cp_verify_context),true);
do $$begin if exists(select 1 from public.cp_campaigns c join cp_verify_context x on c.id=x.cid) then raise exception 'FAIL: cross-workspace read';end if;end$$;
select 'PASS: hosted create, generated assessment, forged assessment denial, submit, request changes, revision, stale denial, exact-version approval, outsider isolation; all fixtures rolled back' as verification;
rollback;
