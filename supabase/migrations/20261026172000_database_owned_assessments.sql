-- Preserve older assessments as untrusted history; never backfill fabricated provenance.
alter table public.cp_analyses add column trusted boolean not null default false;
alter table public.cp_analyses drop constraint cp_analyses_provider_check;
alter table public.cp_analyses add constraint cp_analyses_provider_check check(provider in ('deterministic-mock-v1','deterministic-mock-v2-db'));
alter table public.cp_analyses alter column provider set default 'deterministic-mock-v2-db';
-- The persisted mock assessment is database-owned. Callers cannot supply findings.
create function private.cp_mock_analysis(p_content text, p_product text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare r record; matches text[]; evidence text; sentence text; result jsonb := '[]'::jsonb; source text; version text; begin
 for r in select * from (values
 ('guaranteed approval|everyone qualifies|100% approval','CP-101','Approval cannot be guaranteed','High','This absolute claim omits eligibility and underwriting conditions.','Subject to credit approval and eligibility requirements.',null::text,'All'),
 ('[0-9]+([.][0-9]+)?%[[:space:]]*(APR|cashback|cash back)?|no fees|no annual fee|save [$][0-9]+','CP-204','Verify product terms and disclosures','Medium','The mock provider has no approved product-rate source.',null::text,'Unverified: rates, fees and savings cannot be substantiated from submitted copy alone.','All'),
 ('pre.?approved|approved mortgage|guaranteed mortgage','CP-310','Prequalification is not a commitment','High','Prequalification must not imply final credit approval.','Explore mortgage prequalification. This is not a commitment to lend.',null::text,'Mortgage'),
 ('act now|last chance|hurry','CP-501','Reduce pressure in the call to action','Low','A pressure-based call to action may discourage informed comparison.','Explore your options.',null::text,'All')
 ) as rules(pattern,policy_id,title,severity,rationale,replacement,uncertainty,product)
 loop
 if r.product<>'All' and r.product<>p_product then continue; end if;
 matches:=regexp_match(p_content,'('||r.pattern||')','i');
 if matches is null then continue; end if;
 evidence:=matches[1];
 if r.replacement is not null then
 for sentence in select regexp_split_to_table(p_content,'(?<=[.!?])[[:space:]]+') loop
 if strpos(sentence,evidence)>0 then evidence:=trim(sentence);exit;end if;
 end loop;
 end if;
 version:=case r.policy_id when 'CP-101' then '1.2' when 'CP-204' then '2.1' else '1.0' end;
 result:=result||jsonb_build_array(jsonb_build_object('id',r.policy_id||'-'||(strpos(p_content,evidence)-1),'policyId',r.policy_id,'policyVersion',version,'source','https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation','title',r.title,'severity',r.severity,'evidence',evidence,'start',strpos(p_content,evidence)-1,'end',strpos(p_content,evidence)-1+length(evidence),'rationale',r.rationale,'replacement',r.replacement,'uncertainty',r.uncertainty));
 end loop;
 if p_product='Affiliate' and p_content !~* 'may (earn|receive) (a )?compensation|paid partnership' then
 evidence:=left(p_content,100);
 result:=result||jsonb_build_array(jsonb_build_object('id','CP-420-0','policyId','CP-420','policyVersion','1.3','source','https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking','title','Disclose the partner relationship','severity','Medium','evidence',evidence,'start',0,'end',length(evidence),'rationale','Affiliate promotions need a clear compensation disclosure.','replacement',null,'uncertainty','Confirm the actual commercial relationship. Suggested disclosure: We may receive compensation from featured partners.'));
 end if;
 return result;
end $$;
revoke all on function private.cp_mock_analysis(text,text) from public,anon,authenticated;

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
 if p_action='approve' and not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and provider='deterministic-mock-v2-db') then raise exception 'Trusted precheck required before approval'; end if;
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
 if not exists(select 1 from public.cp_analyses where version_id=v.id and trusted and provider='deterministic-mock-v2-db') then raise exception 'Trusted precheck required. Create a revision if a legacy assessment exists.'; end if;
 if exists(select 1 from public.cp_events where version_id=v.id and action in ('approve','reject','request_changes')) then raise exception 'Create a revised version before resubmitting'; end if;
 update public.cp_campaigns set status='In review',submitted_at=now(),updated_at=now() where id=c.id;
 end if;
 else raise exception 'Unknown action'; end if;
 end if;
 insert into public.cp_events(campaign_id,version_id,actor_id,action,note) values(c.id,v.id,auth.uid(),p_action,p_data->>'note');
 return c.id;
end $$;
