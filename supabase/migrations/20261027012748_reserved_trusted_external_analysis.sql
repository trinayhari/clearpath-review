-- INACTIVE until explicit administrative approval/configuration. No keys, accounts,
-- limits, enablement rows or hosted settings are inserted by this migration.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table private.cp_ai_keys (
 id text primary key check(length(id) between 1 and 80),
 secret bytea not null check(octet_length(secret)>=32),
 enabled boolean not null default false
);
create table private.cp_ai_limits (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 active_key text not null references private.cp_ai_keys(id),
 -- Cumulative GLOBAL budget across all identities/workspaces/runs, never reset daily.
 total_budget_microusd bigint not null check(total_budget_microusd between 0 and 2000000),
 per_user_hour integer not null check(per_user_hour between 1 and 10),
 per_workspace_day integer not null check(per_workspace_day between 1 and 20)
);
create table private.cp_ai_workspaces(workspace_id uuid primary key references public.cp_workspaces(id), enabled boolean not null default false);
create table private.cp_ai_runs (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null, actor_id uuid not null references auth.users(id),
 workspace_id uuid not null references public.cp_workspaces(id),
 campaign_id uuid not null references public.cp_campaigns(id),
 version_id uuid not null unique references public.cp_versions(id),
 content_hash text not null, policy_bundle text not null,
 model text not null, key_id text not null references private.cp_ai_keys(id),
 nonce uuid not null default gen_random_uuid(),
 reserved_microusd bigint not null check(reserved_microusd=200000),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
 state text not null default 'reserved' check(state in ('reserved','running','succeeded','failed')),
 final_hash text, completed_at timestamptz, input_tokens integer, output_tokens integer,
 unique(actor_id,request_id)
);
create index cp_ai_actor_created on private.cp_ai_runs(actor_id,created_at);
create index cp_ai_workspace_created on private.cp_ai_runs(workspace_id,created_at);
alter table private.cp_ai_keys enable row level security;
alter table private.cp_ai_limits enable row level security;
alter table private.cp_ai_workspaces enable row level security;
alter table private.cp_ai_runs enable row level security;
revoke all on private.cp_ai_keys,private.cp_ai_limits,private.cp_ai_workspaces,private.cp_ai_runs from public,anon,authenticated;
create function private.cp_ai_run_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'Immutable execution history'; end if;
 if (to_jsonb(new)-array['state','final_hash','completed_at','input_tokens','output_tokens']) is distinct from (to_jsonb(old)-array['state','final_hash','completed_at','input_tokens','output_tokens']) then raise exception 'Immutable execution binding'; end if;
 if not ((old.state='reserved' and new.state='running') or (old.state='running' and new.state in ('succeeded','failed'))) then raise exception 'Invalid execution transition'; end if;
 return new;
end $$;
revoke all on function private.cp_ai_run_guard() from public,anon,authenticated;
create trigger cp_ai_runs_guard before update or delete on private.cp_ai_runs for each row execute function private.cp_ai_run_guard();

alter table public.cp_analyses add column execution_id uuid unique references private.cp_ai_runs(id);
alter table public.cp_analyses add column provenance jsonb;
alter table public.cp_analyses drop constraint cp_analyses_provider_check;
alter table public.cp_analyses add constraint cp_analyses_provider_check check(provider in ('deterministic-mock-v1','deterministic-mock-v2-db','openai-responses-v1'));
alter table public.cp_analyses add constraint cp_external_provenance check(provider<>'openai-responses-v1' or (trusted and execution_id is not null and provenance is not null));

-- Only exact supported metadata is signed; secret lookup is private and revoked.
create function private.cp_ai_verify(p_payload text,p_signature text,p_audience text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare body jsonb; k private.cp_ai_keys; expected bytea; supplied bytea; diff integer:=0; n integer; epoch numeric; begin
 if p_payload is null or p_signature is null or octet_length(p_payload)>150000 or p_signature !~ '^[a-f0-9]{64}$' then raise exception 'Invalid analysis signature'; end if;
 body:=p_payload::jsonb;
 if jsonb_typeof(body)<>'object' then raise exception 'Invalid analysis signature'; end if;
 select * into k from private.cp_ai_keys where id=body->>'keyId' and enabled;
 if k.id is null then raise exception 'Analysis key unavailable'; end if;
 expected:=extensions.hmac(convert_to(p_payload,'UTF8'),k.secret,'sha256'); supplied:=decode(p_signature,'hex');
 for n in 0..31 loop diff:=diff | (get_byte(expected,n) # get_byte(supplied,n)); end loop;
 if diff<>0 then raise exception 'Invalid analysis signature'; end if;
 epoch:=extract(epoch from clock_timestamp());
 if body->>'audience' is distinct from p_audience or jsonb_typeof(body->'issuedAt') is distinct from 'number' or jsonb_typeof(body->'expiresAt') is distinct from 'number' or (body->>'issuedAt')::numeric>epoch+5 or (body->>'issuedAt')::numeric<epoch-120 or (body->>'expiresAt')::numeric<epoch or (body->>'expiresAt')::numeric>(body->>'issuedAt')::numeric+120 then raise exception 'Expired or invalid analysis payload'; end if;
 return body;
end $$;
revoke all on function private.cp_ai_verify(text,text,text) from public,anon,authenticated;

create function private.cp_reserve_analysis(p_campaign uuid,p_version uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns; v public.cp_versions; lim private.cp_ai_limits; run private.cp_ai_runs; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Lock order everywhere: campaign, then global budget, then execution.
 select * into c from public.cp_campaigns where id=p_campaign for update;
 if c.id is null or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=auth.uid() and role='marketer') or c.owner_id<>auth.uid() then raise exception 'Campaign owner required'; end if;
 if c.current_version is distinct from p_version then raise exception 'Stale version. Refresh before continuing.'; end if;
 if c.status not in ('Draft','Changes requested') then raise exception 'Campaign is locked'; end if;
 select * into lim from private.cp_ai_limits where singleton for update;
 if lim.singleton is null or not lim.enabled or not exists(select 1 from private.cp_ai_keys where id=lim.active_key and enabled) or not exists(select 1 from private.cp_ai_workspaces where workspace_id=c.workspace_id and enabled) then raise exception 'Live analysis is not enabled'; end if;
 if p_request is null then raise exception 'Analysis request ID required'; end if;
 select * into run from private.cp_ai_runs where actor_id=auth.uid() and request_id=p_request;
 if run.id is not null and (run.campaign_id<>c.id or run.version_id<>p_version) then raise exception 'Analysis request ID already used'; end if;
 if run.id is null then select * into run from private.cp_ai_runs where version_id=p_version; end if;
 if run.id is null then
 if exists(select 1 from public.cp_analyses where version_id=p_version) then raise exception 'Analysis already recorded. Create a new version.'; end if;
 if (select count(*) from private.cp_ai_runs where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=lim.per_user_hour then raise exception 'Analysis user quota reached'; end if;
 if (select count(*) from private.cp_ai_runs where workspace_id=c.workspace_id and created_at>clock_timestamp()-interval '1 day')>=lim.per_workspace_day then raise exception 'Analysis workspace quota reached'; end if;
 if (select coalesce(sum(reserved_microusd),0) from private.cp_ai_runs)+200000>lim.total_budget_microusd then raise exception 'Analysis global budget exhausted'; end if;
 select * into v from public.cp_versions where id=p_version and campaign_id=c.id;
 insert into private.cp_ai_runs(request_id,actor_id,workspace_id,campaign_id,version_id,content_hash,policy_bundle,model,key_id,reserved_microusd)
 values(p_request,auth.uid(),c.workspace_id,c.id,v.id,encode(extensions.digest(convert_to(v.content,'UTF8'),'sha256'),'hex'),'clearpath-review-2026-10-27-v1','gpt-5.4-mini-2026-03-17',lim.active_key,200000) returning * into run;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),'analysis_reserved','External analysis reserved within the approved global budget.');
 end if;
 select * into v from public.cp_versions where id=run.version_id;
 return jsonb_build_object('id',run.id,'actorId',run.actor_id,'workspaceId',run.workspace_id,'campaignId',run.campaign_id,'versionId',run.version_id,'contentHash',run.content_hash,'policyBundle',run.policy_bundle,'model',run.model,'keyId',run.key_id,'nonce',run.nonce,'state',run.state,'expiresAt',extract(epoch from run.expires_at),'content',v.content,'product',c.product,'reservedMicrousd',run.reserved_microusd);
end $$;
revoke all on function private.cp_reserve_analysis(uuid,uuid,uuid) from public,anon;
grant execute on function private.cp_reserve_analysis(uuid,uuid,uuid) to authenticated;
create function public.cp_reserve_analysis(p_campaign uuid,p_version uuid,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.cp_reserve_analysis(p_campaign,p_version,p_request) $$;
revoke all on function public.cp_reserve_analysis(uuid,uuid,uuid) from public,anon;
grant execute on function public.cp_reserve_analysis(uuid,uuid,uuid) to authenticated;

-- Shared execution checks; called only inside explicitly authorized definers.
create function private.cp_ai_binding(body jsonb,run private.cp_ai_runs) returns boolean language sql immutable security invoker set search_path='' as $$
 select body->>'executionId'=run.id::text and body->>'actorId'=run.actor_id::text and body->>'workspaceId'=run.workspace_id::text and body->>'campaignId'=run.campaign_id::text and body->>'versionId'=run.version_id::text and body->>'contentHash'=run.content_hash and body->>'policyBundle'=run.policy_bundle and body->>'model'=run.model and body->>'keyId'=run.key_id and body->>'nonce'=run.nonce::text
$$;
revoke all on function private.cp_ai_binding(jsonb,private.cp_ai_runs) from public,anon,authenticated;

create function private.cp_start_analysis(p_execution uuid,p_payload text,p_signature text) returns boolean language plpgsql security definer set search_path='' as $$
declare run private.cp_ai_runs; c public.cp_campaigns; body jsonb; cid uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select campaign_id into cid from private.cp_ai_runs where id=p_execution and actor_id=auth.uid();
 select * into c from public.cp_campaigns where id=cid for update;
 select * into run from private.cp_ai_runs where id=p_execution for update;
 if c.id is null or run.actor_id is distinct from auth.uid() or c.owner_id<>auth.uid() or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=auth.uid() and role='marketer') then raise exception 'Campaign owner required'; end if;
 if c.current_version<>run.version_id or c.status not in ('Draft','Changes requested') then raise exception 'Stale or locked analysis version'; end if;
 if not exists(select 1 from private.cp_ai_limits where singleton and enabled) or not exists(select 1 from private.cp_ai_workspaces where workspace_id=c.workspace_id and enabled) then raise exception 'Live analysis is not enabled'; end if;
 body:=private.cp_ai_verify(p_payload,p_signature,'clearpath-analysis-start-v1');
 if private.cp_ai_binding(body,run) is distinct from true then raise exception 'Analysis binding mismatch'; end if;
 if run.expires_at<clock_timestamp() then raise exception 'Analysis reservation expired'; end if;
 if run.state<>'reserved' then return false; end if;
 if exists(select 1 from public.cp_analyses where version_id=run.version_id) then raise exception 'Analysis already recorded. Create a new version.'; end if;
 update private.cp_ai_runs set state='running' where id=run.id;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,run.version_id,auth.uid(),'analysis_started','External analysis started; results are not a human decision.');
 return true;
end $$;
revoke all on function private.cp_start_analysis(uuid,text,text) from public,anon;
grant execute on function private.cp_start_analysis(uuid,text,text) to authenticated;
create function public.cp_start_analysis(p_execution uuid,p_payload text,p_signature text) returns boolean language sql security invoker set search_path='' as $$ select private.cp_start_analysis(p_execution,p_payload,p_signature) $$;
revoke all on function public.cp_start_analysis(uuid,text,text) from public,anon;
grant execute on function public.cp_start_analysis(uuid,text,text) to authenticated;

create function private.cp_validate_external_findings(findings jsonb,copy text,product text) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare f jsonb; field text; version text; expected_source text; first_pos integer; last_pos integer; begin
 if jsonb_typeof(findings) is distinct from 'array' then return false; end if;
 if jsonb_array_length(findings)>20 then return false; end if;
 for f in select value from jsonb_array_elements(findings) loop
 if jsonb_typeof(f) is distinct from 'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(f))<>12 then return false; end if;
 foreach field in array array['id','policyId','policyVersion','source','severity','title','evidence','rationale','uncertainty'] loop
 if jsonb_typeof(f->field) is distinct from 'string' or length(f->>field)=0 then return false; end if;
 end loop;
 if length(f->>'id')>100 or length(f->>'title')>180 or length(f->>'evidence')>2000 or length(f->>'rationale')>2000 or length(f->>'uncertainty')>1200 then return false; end if;
 if jsonb_typeof(f->'replacement') is distinct from 'null' and (jsonb_typeof(f->'replacement') is distinct from 'string' or length(f->>'replacement')>2000) then return false; end if;
 if f->>'severity' not in ('High','Medium','Low') then return false; end if;
 version:=case f->>'policyId' when 'CP-101' then '1.2' when 'CP-204' then '2.1' when 'CP-310' then '1.0' when 'CP-420' then '1.3' when 'CP-501' then '1.0' else null end;
 if version is null or f->>'policyVersion'<>version or (f->>'policyId'='CP-310' and product<>'Mortgage') or (f->>'policyId'='CP-420' and product<>'Affiliate') then return false; end if;
 expected_source:=case when f->>'policyId'='CP-420' then 'https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking' else 'https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation' end;
 if f->>'source'<>expected_source then return false; end if;
 if jsonb_typeof(f->'start') is distinct from 'number' or jsonb_typeof(f->'end') is distinct from 'number' or (f->>'start') !~ '^[0-9]{1,6}$' or (f->>'end') !~ '^[0-9]{1,6}$' then return false; end if;
 first_pos:=(f->>'start')::integer;last_pos:=(f->>'end')::integer;
 if first_pos<0 or last_pos<=first_pos or last_pos>length(copy) or substring(copy from first_pos+1 for last_pos-first_pos)<>f->>'evidence' then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function private.cp_validate_external_findings(jsonb,text,text) from public,anon,authenticated;

create function private.cp_finalize_analysis(p_execution uuid,p_payload text,p_signature text) returns uuid language plpgsql security definer set search_path='' as $$
declare run private.cp_ai_runs; c public.cp_campaigns; v public.cp_versions; body jsonb; cid uuid; payload_hash text; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select campaign_id into cid from private.cp_ai_runs where id=p_execution and actor_id=auth.uid();
 select * into c from public.cp_campaigns where id=cid for update;
 select * into run from private.cp_ai_runs where id=p_execution for update;
 if c.id is null or run.actor_id is distinct from auth.uid() or c.owner_id<>auth.uid() or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=auth.uid() and role='marketer') then raise exception 'Campaign owner required'; end if;
 if c.current_version<>run.version_id or c.status not in ('Draft','Changes requested') then raise exception 'Stale or locked analysis version'; end if;
 if not exists(select 1 from private.cp_ai_limits where singleton and enabled) or not exists(select 1 from private.cp_ai_workspaces where workspace_id=c.workspace_id and enabled) then raise exception 'Live analysis is not enabled'; end if;
 body:=private.cp_ai_verify(p_payload,p_signature,'clearpath-analysis-finalize-v1');
 if private.cp_ai_binding(body,run) is distinct from true then raise exception 'Analysis binding mismatch'; end if;
 if run.expires_at<clock_timestamp() then raise exception 'Analysis reservation expired'; end if;
 payload_hash:=encode(extensions.digest(convert_to(p_payload,'UTF8'),'sha256'),'hex');
 if run.state in ('succeeded','failed') then
 if run.final_hash=payload_hash then return c.id; end if;
 raise exception 'Analysis execution already finalized';
 end if;
 if run.state<>'running' then raise exception 'Analysis execution not started'; end if;
 if body->>'outcome' not in ('succeeded','failed') or body->>'outcome' is null then raise exception 'Invalid analysis outcome'; end if;
 select * into v from public.cp_versions where id=run.version_id;
 if encode(extensions.digest(convert_to(v.content,'UTF8'),'sha256'),'hex')<>run.content_hash then raise exception 'Analysis content mismatch'; end if;
 if body->>'outcome'='succeeded' then
 if private.cp_validate_external_findings(body->'findings',v.content,c.product) is distinct from true then raise exception 'Invalid analysis findings'; end if;
 if jsonb_typeof(body->'responseId') is distinct from 'string' or body->>'responseId' is null or length(body->>'responseId') not between 1 and 200 or jsonb_typeof(body->'inputTokens') is distinct from 'number' or jsonb_typeof(body->'outputTokens') is distinct from 'number' or (body->>'inputTokens') !~ '^[0-9]{1,6}$' or (body->>'outputTokens') !~ '^[0-9]{1,4}$' or (body->>'inputTokens')::integer>102048 or (body->>'outputTokens')::integer>4500 then raise exception 'Invalid analysis usage'; end if;
 insert into public.cp_analyses(version_id,findings,provider,trusted,execution_id,provenance) values(v.id,body->'findings','openai-responses-v1',true,run.id,jsonb_build_object('model',run.model,'policyBundle',run.policy_bundle,'contentHash',run.content_hash,'responseId',body->>'responseId','inputTokens',(body->>'inputTokens')::integer,'outputTokens',(body->>'outputTokens')::integer));
 else
 if body->>'errorCode' is null or body->>'errorCode' not in ('timeout','provider_error','invalid_output','unknown') then raise exception 'Invalid analysis failure'; end if;
 end if;
 update private.cp_ai_runs set state=body->>'outcome',final_hash=payload_hash,completed_at=clock_timestamp(),input_tokens=case when body->>'outcome'='succeeded' then (body->>'inputTokens')::integer end,output_tokens=case when body->>'outcome'='succeeded' then (body->>'outputTokens')::integer end where id=run.id;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),case when body->>'outcome'='succeeded' then 'analyze' else 'analysis_failed' end,case when body->>'outcome'='succeeded' then 'OpenAI analysis completed on this exact version. Human review is required.' else 'External analysis failed; no assessment was stored. Budget reservation retained.' end);
 return c.id;
end $$;
revoke all on function private.cp_finalize_analysis(uuid,text,text) from public,anon;
grant execute on function private.cp_finalize_analysis(uuid,text,text) to authenticated;
create function public.cp_finalize_analysis(p_execution uuid,p_payload text,p_signature text) returns uuid language sql security invoker set search_path='' as $$ select private.cp_finalize_analysis(p_execution,p_payload,p_signature) $$;
revoke all on function public.cp_finalize_analysis(uuid,text,text) from public,anon;
grant execute on function public.cp_finalize_analysis(uuid,text,text) to authenticated;

-- Preserve all workflow authorization; accept only separately finalized live provenance.
create or replace function private.cp_command(p_action text, p_campaign uuid, p_version uuid, p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 if p_action='approve' and not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and (provider='deterministic-mock-v2-db' or (provider='openai-responses-v1' and execution_id is not null))) then raise exception 'Trusted precheck required before approval'; end if;
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
 if p_data ? 'findings' then raise exception 'Client-supplied findings are not accepted'; end if;
 insert into public.cp_analyses(version_id,findings,trusted) values(v.id,private.cp_mock_analysis(v.content,c.product),true);
 elsif p_action='submit' then
 if not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and (provider='deterministic-mock-v2-db' or (provider='openai-responses-v1' and execution_id is not null))) then raise exception 'Trusted precheck required. Create a revision if a legacy assessment exists.'; end if;
 if exists(select 1 from public.cp_events where version_id=v.id and action in ('approve','reject','request_changes')) then raise exception 'Create a revised version before resubmitting'; end if;
 update public.cp_campaigns set status='In review',submitted_at=now(),updated_at=now() where id=c.id;
 end if;
 else raise exception 'Unknown action'; end if;
 end if;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),p_action,p_data->>'note');
 return c.id;
end $$;
