-- Compare studies with shared anatomical coverage while excluding unrelated regions.
create function public.imaging_regions_overlap(a text,b text) returns boolean language plpgsql immutable set search_path='' as $$
declare a_clean text:=lower(translate(trim(coalesce(a,'')),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc')); b_clean text:=lower(translate(trim(coalesce(b,'')),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'));
begin
 if a_clean=b_clean then return true; end if;
 return exists(select 1 from (values ('\y(chest|thorax|thoracic|thoracique)\y'),('\y(abdomen|abdominal|abdomino)\y'),('\y(pelvis|pelvic|pelvien)\y'),('\y(brain|cerebral|cerebrale|cerveau)\y'),('\y(spine|spinal|rachis|rachidien)\y'),('\y(knee|genou)\y'),('\y(shoulder|epaule)\y'),('\y(heart|cardiac|cardiaque)\y')) regions(pattern) where a_clean~pattern and b_clean~pattern);
end $$;
revoke all on function public.imaging_regions_overlap(text,text) from public,anon,authenticated;

alter function public.save_event(jsonb) rename to save_event_before_compact_forms;
revoke all on function public.save_event_before_compact_forms(jsonb) from public,anon,authenticated;
create function public.save_event(event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare kind text:=coalesce(event->>'eventType','Other');
begin
 if kind<>'Other' and trim(coalesce(event->>'doctor',''))='' then raise exception 'Enter the doctor name'; end if;
 if kind in ('Procedure','Prescription') then event:=event||jsonb_build_object('time','','reminderMinutes',null); end if;
 if kind<>'Other' then event:=event||jsonb_build_object('endDate',''); end if;
 if kind='Prescription' then event:=event||jsonb_build_object('location',''); end if;
 if kind='Consultation' then event:=event||jsonb_build_object('title','Consultation'); end if;
 perform public.save_event_before_compact_forms(event);
end $$;
revoke all on function public.save_event(jsonb) from public,anon;
grant execute on function public.save_event(jsonb) to authenticated;

-- Cached longer summaries are retained privately but not returned for the new scope.
alter table public.imaging_comparisons alter column summary_version set default 3;

create or replace function public.request_history_conclusion(ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); facts jsonb; ordered_ids uuid[]; versions integer[]; result uuid; key text; kind text; first_panel text; first_region text; r public.reports; region_list text[] := '{}';
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 if cardinality(ids)<2 or cardinality(ids)>30 or (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then raise exception 'Choose 2 to 30 different reviewed reports'; end if;
 if (select count(*) from public.reports where id=any(ids) and owner_id=u)<>cardinality(ids) then raise exception 'Report unavailable'; end if;
 for r in select * from public.reports where id=any(ids) and owner_id=u order by examination_date,id loop
  if r.kind not in ('lab','imaging') or not r.date_reviewed or r.examination_date is null then raise exception 'Confirm all examination dates first'; end if;
  if kind is null then kind:=r.kind;first_panel:=public.comparison_panel_key(r.panel_code,r.panel);first_region:=lower(trim(r.body_region)); end if;
  if r.kind<>kind or public.comparison_panel_key(r.panel_code,r.panel)<>first_panel then raise exception 'Choose the same panel type and body region'; end if;
  if kind='imaging' and exists(select 1 from unnest(region_list) previous(region) where not public.imaging_regions_overlap(region,r.body_region)) then raise exception 'Choose imaging reports with shared anatomical coverage'; end if;
  if kind='imaging' then region_list:=array_append(region_list,r.body_region); end if;
  if kind='imaging' and (not r.conclusion_reviewed or trim(r.conclusion)='') then raise exception 'Review all source conclusions first'; end if;
  if kind='lab' and (not exists(select 1 from public.observations o where o.report_id=r.id) or exists(select 1 from public.observations o where o.report_id=r.id and (o.data#>>'{review,value}' is distinct from 'reviewed' or o.data#>>'{review,unit}' is distinct from 'reviewed' or o.data#>>'{review,range}' is distinct from 'reviewed'))) then raise exception 'Review all laboratory values first'; end if;
 end loop;
 select array_agg(id order by examination_date,id),array_agg(revision order by examination_date,id) into ordered_ids,versions from public.reports where id=any(ids) and owner_id=u;
 key:=md5(ordered_ids::text||versions::text||'conclusions-v2-short-overlap');
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
create or replace function public.request_imaging_comparison(earlier uuid,later uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); a public.reports; b public.reports; result uuid; facts jsonb;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 select * into a from public.reports where id=earlier and owner_id=u;
 select * into b from public.reports where id=later and owner_id=u;
 if a.id is null or b.id is null or a.id=b.id or a.kind<>'imaging' or b.kind<>'imaging' then raise exception 'Choose two imaging reports'; end if;
 if public.imaging_panel_key(a.panel_code,a.panel)<>public.imaging_panel_key(b.panel_code,b.panel) or not public.imaging_regions_overlap(a.body_region,b.body_region) then raise exception 'Choose the same study type and body region'; end if;
 if not a.conclusion_reviewed or not b.conclusion_reviewed or not a.date_reviewed or not b.date_reviewed then raise exception 'Review both reports and their examination dates first'; end if;
 if a.examination_date>b.examination_date then raise exception 'Choose the earlier report first'; end if;
 if trim(a.conclusion)='' or trim(b.conclusion)='' then raise exception 'Both reports need a conclusion or description'; end if;
 select id into result from public.imaging_comparisons where owner_id=u and earlier_id=a.id and later_id=b.id and earlier_revision=a.revision and later_revision=b.revision and status<>'failed' and summary_version=3;
 if result is not null then return result; end if;
 if (select count(*) from public.imaging_comparisons where owner_id=u and status in ('queued','running'))>=5 then raise exception 'Please wait for your pending comparisons'; end if;
 facts := jsonb_build_array(jsonb_build_object('date',a.examination_date,'panel',a.panel,'bodyRegion',a.body_region,'conclusion',a.conclusion),jsonb_build_object('date',b.examination_date,'panel',b.panel,'bodyRegion',b.body_region,'conclusion',b.conclusion));
 insert into public.imaging_comparisons(owner_id,earlier_id,later_id,earlier_revision,later_revision,source_reports)
 values(u,a.id,b.id,a.revision,b.revision,facts)
 on conflict(owner_id,earlier_id,later_id,earlier_revision,later_revision) do update set status='queued',summary=null,attempts=0,created_at=now(),summary_version=3
 returning id into result;
 return result;
end $$;

create or replace function public.get_imaging_comparison(comparison_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; u uuid := public.require_mfa();
begin
 result:=public.get_imaging_comparison_previous_scope(comparison_id);
 if exists(select 1 from public.imaging_comparisons where id=comparison_id and owner_id=u and summary_version<>3) then return jsonb_build_object('status','stale','summary',null); end if;
 return result;
end $$;
revoke all on function public.get_imaging_comparison(uuid) from public,anon;
grant execute on function public.get_imaging_comparison(uuid) to authenticated;
