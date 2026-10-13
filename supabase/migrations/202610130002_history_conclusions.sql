-- Canonical aliases also cover older laboratory records without a panel code.
create or replace function public.imaging_panel_key(code text,panel text) returns text language sql immutable set search_path='' as $$
 select coalesce(nullif(code,''),trim(both '_' from regexp_replace(lower(translate(trim(panel),'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ','AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),'[^a-z0-9]+','_','g')));
$$;
create function public.comparison_panel_key(code text,panel text) returns text language sql immutable set search_path='' as $$
 select case public.imaging_panel_key(code,panel)
 when 'nfs' then 'complete_blood_count' when 'cbc' then 'complete_blood_count' when 'complete_blood_count_nfs' then 'complete_blood_count' when 'complete_blood_count_cbc' then 'complete_blood_count'
 when 'kidney_function_test' then 'kidney_function' when 'kidney_function_panel' then 'kidney_function' when 'renal_function' then 'kidney_function'
 when 'liver_panel' then 'liver_function' when 'liver_function_panel' then 'liver_function'
 when 'thyroid_function_test' then 'thyroid_function' when 'thyroid_function_panel' then 'thyroid_function'
 when 'hemoglobin_a1c_glucose' then 'glycemic_panel' when 'coagulation_profile' then 'coagulation' when 'electrolytes_panel' then 'electrolytes'
 when 'vitamin_mineral_panel' then 'vitamins_minerals' when 'cathecolamine' then 'catecholamines'
 when 'numeration_formule_sanguine' then 'complete_blood_count' when 'bilan_renal' then 'kidney_function' when 'bilan_hepatique' then 'liver_function' when 'inflammatory_markers' then 'inflammatory_markers'
 else public.imaging_panel_key(code,panel) end;
$$;
revoke all on function public.comparison_panel_key(text,text) from public,anon,authenticated;
create table public.history_conclusions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 report_ids uuid[] not null, revisions integer[] not null, request_key text not null, mode text not null check(mode in ('lab','imaging')),
 source_reports jsonb not null, status text not null default 'queued' check(status in ('queued','running','done','failed')),
 summary text check(length(summary)<=2500), lease_token uuid, leased_until timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), unique(owner_id,request_key)
);
alter table public.history_conclusions enable row level security;
grant all on public.history_conclusions to service_role;
create function public.request_history_conclusion(ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); facts jsonb; ordered_ids uuid[]; versions integer[]; result uuid; key text; kind text; first_panel text; first_region text; r public.reports;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 if cardinality(ids)<2 or cardinality(ids)>30 or (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then raise exception 'Choose 2 to 30 different reviewed reports'; end if;
 if (select count(*) from public.reports where id=any(ids) and owner_id=u)<>cardinality(ids) then raise exception 'Report unavailable'; end if;
 for r in select * from public.reports where id=any(ids) and owner_id=u order by examination_date,id loop
  if r.kind not in ('lab','imaging') or not r.date_reviewed or r.examination_date is null then raise exception 'Confirm all examination dates first'; end if;
  if kind is null then kind:=r.kind;first_panel:=public.comparison_panel_key(r.panel_code,r.panel);first_region:=lower(trim(r.body_region)); end if;
  if r.kind<>kind or public.comparison_panel_key(r.panel_code,r.panel)<>first_panel or (kind='imaging' and lower(trim(r.body_region))<>first_region) then raise exception 'Choose the same panel type and body region'; end if;
  if kind='imaging' and (not r.conclusion_reviewed or trim(r.conclusion)='') then raise exception 'Review all source conclusions first'; end if;
  if kind='lab' and (not exists(select 1 from public.observations o where o.report_id=r.id) or exists(select 1 from public.observations o where o.report_id=r.id and (o.data#>>'{review,value}' is distinct from 'reviewed' or o.data#>>'{review,unit}' is distinct from 'reviewed' or o.data#>>'{review,range}' is distinct from 'reviewed'))) then raise exception 'Review all laboratory values first'; end if;
 end loop;
 select array_agg(id order by examination_date,id),array_agg(revision order by examination_date,id) into ordered_ids,versions from public.reports where id=any(ids) and owner_id=u;
 key:=md5(ordered_ids::text||versions::text||'conclusions-v1');
 select id into result from public.history_conclusions where owner_id=u and request_key=key and status<>'failed';
 if result is not null then return result; end if;
 if (select count(*) from public.history_conclusions where owner_id=u and status in ('queued','running'))>=5 then raise exception 'Wait for your pending conclusions'; end if;
 select jsonb_agg(jsonb_build_object('date',item->>'date','panel',item->>'panel','bodyRegion',item->>'bodyRegion',
 'conclusion',case when kind='imaging' then item->>'conclusion' else null end,'observations',case when kind='lab' then item->'observations' else '[]'::jsonb end) order by item->>'date',item->>'id') into facts
 from jsonb_array_elements(public.get_snapshot()->'reports') item where (item->>'id')::uuid=any(ordered_ids);
 if length(facts::text)>250000 then raise exception 'Choose fewer reports for the AI conclusion'; end if;
 insert into public.history_conclusions(owner_id,report_ids,revisions,request_key,mode,source_reports) values(u,ordered_ids,versions,key,kind,facts)
 on conflict(owner_id,request_key) do update set status='queued',attempts=0,summary=null returning id into result;
 return result;
end $$;
create function public.get_history_conclusion(comparison_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); c public.history_conclusions;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'AI interpretation is hidden'; end if;
 select * into c from public.history_conclusions where id=comparison_id and owner_id=u;
 if c.id is null then raise exception 'Conclusion not found'; end if;
 if (select count(*) from unnest(c.report_ids,c.revisions) source(id,revision) join public.reports r on r.id=source.id and r.revision=source.revision and r.owner_id=u)<>cardinality(c.report_ids) then return jsonb_build_object('status','stale','summary',null); end if;
 return jsonb_build_object('status',c.status,'summary',case when c.status='done' then c.summary else null end);
end $$;
create function public.claim_history_conclusion() returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.history_conclusions;
begin
 update public.history_conclusions set status='failed' where status='running' and leased_until<now() and attempts>=3;
 select * into c from public.history_conclusions where status='queued' or (status='running' and leased_until<now() and attempts<3) order by created_at for update skip locked limit 1;
 if c.id is null then return null; end if;
 update public.history_conclusions set status='running',lease_token=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'token',c.lease_token,'mode',c.mode,'reports',c.source_reports);
end $$;
create function public.complete_history_conclusion(comparison_id uuid,token uuid,result text) returns void language plpgsql security definer set search_path='' as $$
begin
 if result is not null and (trim(result)='' or length(result)>2500) then raise exception 'Invalid conclusion'; end if;
 update public.history_conclusions set status=case when result is null then 'failed' else 'done' end,summary=result,lease_token=null,leased_until=null where id=comparison_id and lease_token=token and status='running' and leased_until>now();
 if not found then raise exception 'Conclusion lease expired'; end if;
end $$;
create function public.remove_deleted_report_conclusions() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.history_conclusions where report_ids @> array[old.id]; return old; end $$;
create trigger remove_report_conclusions after delete on public.reports for each row execute function public.remove_deleted_report_conclusions();
revoke all on function public.remove_deleted_report_conclusions(),public.request_history_conclusion(uuid[]),public.get_history_conclusion(uuid),public.claim_history_conclusion(),public.complete_history_conclusion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_history_conclusion(uuid[]),public.get_history_conclusion(uuid) to authenticated;
grant execute on function public.claim_history_conclusion(),public.complete_history_conclusion(uuid,uuid,text) to service_role;

-- Previous pair comparisons included descriptions; regenerate them for conclusion-only scope.
alter table public.imaging_comparisons add column summary_version integer not null default 1;
alter table public.imaging_comparisons alter column summary_version set default 2;
create or replace function public.request_imaging_comparison(earlier uuid,later uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); a public.reports; b public.reports; result uuid; facts jsonb;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 select * into a from public.reports where id=earlier and owner_id=u;
 select * into b from public.reports where id=later and owner_id=u;
 if a.id is null or b.id is null or a.id=b.id or a.kind<>'imaging' or b.kind<>'imaging' then raise exception 'Choose two imaging reports'; end if;
 if public.imaging_panel_key(a.panel_code,a.panel)<>public.imaging_panel_key(b.panel_code,b.panel) or lower(trim(a.body_region))<>lower(trim(b.body_region)) then raise exception 'Choose the same study type and body region'; end if;
 if not a.conclusion_reviewed or not b.conclusion_reviewed or not a.date_reviewed or not b.date_reviewed then raise exception 'Review both reports and their examination dates first'; end if;
 if a.examination_date>b.examination_date then raise exception 'Choose the earlier report first'; end if;
 if trim(a.conclusion)='' or trim(b.conclusion)='' then raise exception 'Both reports need a conclusion or description'; end if;
 select id into result from public.imaging_comparisons where owner_id=u and earlier_id=a.id and later_id=b.id and earlier_revision=a.revision and later_revision=b.revision and status<>'failed' and summary_version=2;
 if result is not null then return result; end if;
 if (select count(*) from public.imaging_comparisons where owner_id=u and status in ('queued','running'))>=5 then raise exception 'Please wait for your pending comparisons'; end if;
 facts := jsonb_build_array(jsonb_build_object('date',a.examination_date,'panel',a.panel,'bodyRegion',a.body_region,'conclusion',a.conclusion),jsonb_build_object('date',b.examination_date,'panel',b.panel,'bodyRegion',b.body_region,'conclusion',b.conclusion));
 insert into public.imaging_comparisons(owner_id,earlier_id,later_id,earlier_revision,later_revision,source_reports)
 values(u,a.id,b.id,a.revision,b.revision,facts)
 on conflict(owner_id,earlier_id,later_id,earlier_revision,later_revision) do update set status='queued',summary=null,attempts=0,created_at=now(),summary_version=2
 returning id into result;
 return result;
end $$;

alter function public.get_imaging_comparison(uuid) rename to get_imaging_comparison_previous_scope;
revoke all on function public.get_imaging_comparison_previous_scope(uuid) from public,anon,authenticated;
create function public.get_imaging_comparison(comparison_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; u uuid := public.require_mfa();
begin
 result:=public.get_imaging_comparison_previous_scope(comparison_id);
 if exists(select 1 from public.imaging_comparisons where id=comparison_id and owner_id=u and summary_version<>2) then return jsonb_build_object('status','stale','summary',null); end if;
 return result;
end $$;
revoke all on function public.get_imaging_comparison(uuid) from public,anon;
grant execute on function public.get_imaging_comparison(uuid) to authenticated;
