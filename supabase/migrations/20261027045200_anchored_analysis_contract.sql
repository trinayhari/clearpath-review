-- Future reservations pin anchored output contract v2; existing executions are immutable.
create or replace function private.cp_reserve_analysis(p_campaign uuid,p_version uuid,p_request uuid,p_payload text,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cp_campaigns; v public.cp_versions; lim private.cp_ai_limits; run private.cp_ai_runs; proof jsonb; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Lock order everywhere: campaign, then global budget, then execution.
 select * into c from public.cp_campaigns where id=p_campaign for update;
 if c.id is null or not exists(select 1 from public.cp_members where workspace_id=c.workspace_id and user_id=auth.uid() and role='marketer') or c.owner_id<>auth.uid() then raise exception 'Campaign owner required'; end if;
 if c.current_version is distinct from p_version then raise exception 'Stale version. Refresh before continuing.'; end if;
 if c.status not in ('Draft','Changes requested') then raise exception 'Campaign is locked'; end if;
 proof:=private.cp_ai_verify(p_payload,p_signature,'clearpath-analysis-reserve-v1');
 if proof->>'actorId' is distinct from auth.uid()::text or proof->>'campaignId' is distinct from p_campaign::text or proof->>'versionId' is distinct from p_version::text or proof->>'requestId' is distinct from p_request::text then raise exception 'Analysis reservation proof mismatch'; end if;
 select * into lim from private.cp_ai_limits where singleton for update;
 if lim.singleton is null or not lim.enabled or not exists(select 1 from private.cp_ai_keys where id=lim.active_key and enabled) or not exists(select 1 from private.cp_ai_workspaces where workspace_id=c.workspace_id and enabled) then raise exception 'Live analysis is not enabled'; end if;
 if proof->>'keyId' is distinct from lim.active_key then raise exception 'Analysis reservation key mismatch'; end if;
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
 values(p_request,auth.uid(),c.workspace_id,c.id,v.id,encode(extensions.digest(convert_to(v.content,'UTF8'),'sha256'),'hex'),'clearpath-review-2026-10-27-v2-anchored','gpt-5.4-mini-2026-03-17',lim.active_key,200000) returning * into run;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),'analysis_reserved','External analysis reserved within the approved global budget.');
 end if;
 select * into v from public.cp_versions where id=run.version_id;
 return jsonb_build_object('id',run.id,'actorId',run.actor_id,'workspaceId',run.workspace_id,'campaignId',run.campaign_id,'versionId',run.version_id,'contentHash',run.content_hash,'policyBundle',run.policy_bundle,'model',run.model,'keyId',run.key_id,'nonce',run.nonce,'state',run.state,'expiresAt',extract(epoch from run.expires_at),'content',v.content,'product',c.product,'reservedMicrousd',run.reserved_microusd);
end $$;
