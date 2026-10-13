-- Generated commentary stays separate from the source conclusion/findings.
alter table public.reports add column source_pages integer[] not null default '{}';
alter table public.reports add column educational_note text;
alter table public.reports add column ai_interpretation text;
alter table public.reports add constraint report_education_length check (length(educational_note)<=1500);
alter table public.reports add constraint report_interpretation_length check (length(ai_interpretation)<=6000);
alter table public.reports add constraint report_source_pages check (cardinality(source_pages)<=50 and (cardinality(source_pages)=0 or (1<=all(source_pages) and 50>=all(source_pages))));
update public.reports set source_pages=array[source_page] where source_page is not null;

create table public.user_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 show_ai_interpretation boolean not null default false
);
alter table public.user_preferences enable row level security;
create policy preferences_owner on public.user_preferences for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
grant all on public.user_preferences to service_role;

create function public.set_ai_interpretation_preference(enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 if enabled is null then raise exception 'Preference must be true or false'; end if;
 insert into public.user_preferences(owner_id,show_ai_interpretation) values(u,enabled)
 on conflict(owner_id) do update set show_ai_interpretation=enabled;
end $$;
revoke all on function public.set_ai_interpretation_preference(boolean) from public,anon;
grant execute on function public.set_ai_interpretation_preference(boolean) to authenticated;

alter function public.get_snapshot() rename to get_snapshot_without_insights;
revoke all on function public.get_snapshot_without_insights() from public,anon,authenticated;
create function public.get_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); snapshot jsonb;
begin
 snapshot := public.get_snapshot_without_insights();
 snapshot := jsonb_set(snapshot,'{reports}',coalesce((
  select jsonb_agg(item.value || jsonb_build_object('sourcePages',r.source_pages,'educationalNote',r.educational_note,'aiInterpretation',r.ai_interpretation))
  from jsonb_array_elements(snapshot->'reports') item(value) join public.reports r on r.id=(item.value->>'id')::uuid and r.owner_id=u
 ),'[]'::jsonb));
 return snapshot || jsonb_build_object('preferences',jsonb_build_object('showAiInterpretation',coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false)));
end $$;
revoke all on function public.get_snapshot() from public,anon;
grant execute on function public.get_snapshot() to authenticated;

-- A signature of source facts, independent of review flags, row order and revision.
create function public.report_source_facts(report jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('panel',report->>'panel','date',coalesce(report->>'date',''),'bodyRegion',coalesce(report->>'bodyRegion',''),
  'conclusion',coalesce(report->>'conclusion',''),'findings',coalesce(report->>'findings',''),
  'observations',coalesce((select jsonb_agg(jsonb_build_array(o->>'id',o->>'label',o->>'parameter',o->>'value',o->>'unit',o->>'range') order by o->>'id') from jsonb_array_elements(report->'observations') o),'[]'::jsonb));
$$;
revoke all on function public.report_source_facts(jsonb) from public,anon,authenticated;

alter function public.save_report(jsonb) rename to save_report_without_insights;
revoke all on function public.save_report_without_insights(jsonb) from public,anon,authenticated;
create function public.save_report(report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); before_report jsonb;
begin
 select item into before_report from jsonb_array_elements(public.get_snapshot()->'reports') item where item->>'id'=report->>'id';
 perform public.save_report_without_insights(report);
 -- Clients cannot inject or overwrite model commentary. Preserve it only while facts match.
 if public.report_source_facts(before_report) is distinct from public.report_source_facts(report) then
  update public.reports set ai_interpretation=null, educational_note=case when before_report->>'panel' is distinct from report->>'panel' then null else educational_note end
  where id=(report->>'id')::uuid and owner_id=u;
 end if;
end $$;
revoke all on function public.save_report(jsonb) from public,anon;
grant execute on function public.save_report(jsonb) to authenticated;

alter function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) rename to complete_extraction_without_insights;
revoke all on function public.complete_extraction_without_insights(bigint,uuid,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create function public.complete_extraction(job_id bigint,token uuid,source_text text,candidates jsonb,engine_name text,document_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.jobs; candidate jsonb; panel_pages integer[]; page_count integer;
begin
 select * into j from public.jobs where id=job_id and lease_token=token and status='running' and kind='extract' for update;
 if not found then raise exception 'Job lease expired'; end if;
 select pages into page_count from public.documents where id=j.document_id and owner_id=j.owner_id;
 perform public.complete_extraction_without_insights(job_id,token,source_text,candidates,engine_name,document_metadata);
 for candidate in select value from jsonb_array_elements(candidates) loop
  if candidate ? 'sourcePages' then
   if jsonb_typeof(candidate->'sourcePages') is distinct from 'array' then raise exception 'Invalid source pages'; end if;
   select coalesce(array_agg(distinct value::integer order by value::integer),'{}') into panel_pages from jsonb_array_elements_text(candidate->'sourcePages');
  else panel_pages := case when candidate->>'sourcePage' is not null then array[(candidate->>'sourcePage')::integer] else '{}'::integer[] end;
  end if;
  if cardinality(panel_pages)>50 or not (1<=all(panel_pages) and page_count>=all(panel_pages)) then raise exception 'Invalid source pages'; end if;
  if length(candidate->>'educationalNote')>1500 or length(candidate->>'aiInterpretation')>6000 then raise exception 'Panel insight too long'; end if;
  update public.reports set source_pages=panel_pages, educational_note=nullif(candidate->>'educationalNote',''), ai_interpretation=nullif(candidate->>'aiInterpretation','')
  where id=(candidate->>'id')::uuid and document_id=j.document_id and owner_id=j.owner_id and revision=0;
 end loop;
end $$;
revoke all on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) to service_role;
