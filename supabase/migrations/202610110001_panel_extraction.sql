-- Keep the original document as the parent of test-specific reports.
alter table public.reports add column panel_code text not null default '';
alter table public.reports add column source_page integer;
alter table public.reports add constraint reports_panel_code_format check (panel_code = '' or panel_code ~ '^[a-z][a-z0-9_]{0,79}$');
alter table public.reports add constraint reports_source_page_range check (source_page between 1 and 50);
create index reports_panel_code_history on public.reports(owner_id, panel_code, examination_date);

alter function public.get_snapshot() rename to get_snapshot_without_panel_details;
revoke all on function public.get_snapshot_without_panel_details() from public, anon, authenticated;
create function public.get_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 snapshot := public.get_snapshot_without_panel_details();
 return jsonb_set(snapshot, '{reports}', coalesce((
   select jsonb_agg(item.value || jsonb_build_object('panelCode', r.panel_code, 'sourcePage', r.source_page))
   from jsonb_array_elements(snapshot->'reports') item(value)
   join public.reports r on r.id=(item.value->>'id')::uuid
 ), '[]'::jsonb));
end $$;
revoke all on function public.get_snapshot() from public, anon;
grant execute on function public.get_snapshot() to authenticated;

alter function public.save_report(jsonb) rename to save_report_without_panel_details;
revoke all on function public.save_report_without_panel_details(jsonb) from public, anon, authenticated;
create function public.save_report(report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 if coalesce(report->>'panelCode','') <> '' and coalesce(report->>'panelCode','') !~ '^[a-z][a-z0-9_]{0,79}$' then raise exception 'Invalid panel code'; end if;
 if report ? 'sourcePage' and report->>'sourcePage' is not null and (report->>'sourcePage')::integer not between 1 and 50 then raise exception 'Invalid source page'; end if;
 perform public.save_report_without_panel_details(report);
 update public.reports set panel_code=coalesce(report->>'panelCode',''), source_page=nullif(report->>'sourcePage','')::integer
 where id=(report->>'id')::uuid and owner_id=u;
end $$;
revoke all on function public.save_report(jsonb) from public, anon;
grant execute on function public.save_report(jsonb) to authenticated;

-- The five-argument RPC remains available for older workers. The six-argument
-- RPC adds validated document metadata and report page/panel identities.
create function public.complete_extraction(job_id bigint, token uuid, source_text text, candidates jsonb, engine_name text, document_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.jobs; candidate jsonb; metadata_category text := document_metadata->>'category'; metadata_title text := trim(coalesce(document_metadata->>'title','')); original_title text; original_filename text;
begin
 select * into j from public.jobs where id=job_id and lease_token=token and status='running' and kind='extract';
 if not found then raise exception 'Job lease expired'; end if;
 if jsonb_typeof(candidates) is distinct from 'array' or jsonb_array_length(candidates)<1 or jsonb_array_length(candidates)>50 then raise exception 'Invalid report candidates'; end if;
 if metadata_category is not null and metadata_category not in ('Laboratory','Imaging','Pathology','Procedures','Prescriptions','Consultations','Other') then raise exception 'Invalid document category'; end if;
 if length(metadata_title)>200 then raise exception 'Document title too long'; end if;
 select d.title,d.filename into original_title,original_filename from public.documents d where d.id=j.document_id and d.owner_id=j.owner_id;
 perform public.complete_extraction(job_id,token,source_text,candidates,engine_name);
 for candidate in select value from jsonb_array_elements(candidates) loop
   update public.reports set panel_code=coalesce(candidate->>'panelCode',''), source_page=nullif(candidate->>'sourcePage','')::integer
   where id=(candidate->>'id')::uuid and owner_id=j.owner_id and document_id=j.document_id and revision=0;
 end loop;
 if metadata_category is not null or metadata_title<>'' then
   update public.documents d set category=coalesce(metadata_category,d.category),
     title=case when metadata_title<>'' and (lower(original_title)=lower(regexp_replace(original_filename,'\.[^.]+$','')) or lower(original_title)='scanned report') then metadata_title else d.title end
   where d.id=j.document_id and d.owner_id=j.owner_id;
 end if;
end $$;
revoke all on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) to service_role;
