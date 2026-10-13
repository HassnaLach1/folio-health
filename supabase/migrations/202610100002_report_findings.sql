-- Preserve detailed findings separately from the shorter conclusion.
alter table public.reports add column findings text not null default '';
alter table public.reports add constraint reports_findings_length check (length(findings) <= 20000);

alter function public.get_snapshot() rename to get_snapshot_without_findings;
revoke all on function public.get_snapshot_without_findings() from public, anon, authenticated;
create function public.get_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot := public.get_snapshot_without_findings();
  return jsonb_set(snapshot, '{reports}', coalesce((
    select jsonb_agg(item.value || jsonb_build_object('findings', r.findings))
    from jsonb_array_elements(snapshot->'reports') as item(value)
    join public.reports r on r.id = (item.value->>'id')::uuid
  ), '[]'::jsonb));
end $$;
revoke all on function public.get_snapshot() from public, anon;
grant execute on function public.get_snapshot() to authenticated;

alter function public.save_report(jsonb) rename to save_report_without_findings;
revoke all on function public.save_report_without_findings(jsonb) from public, anon, authenticated;
create function public.save_report(report jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
  if length(coalesce(report->>'findings', '')) > 20000 then raise exception 'Findings too long'; end if;
  perform public.save_report_without_findings(report);
  update public.reports set findings=coalesce(report->>'findings','')
  where id=(report->>'id')::uuid and owner_id=u;
end $$;
revoke all on function public.save_report(jsonb) from public, anon;
grant execute on function public.save_report(jsonb) to authenticated;

alter function public.complete_extraction(bigint,uuid,text,jsonb,text) rename to complete_extraction_without_findings;
revoke all on function public.complete_extraction_without_findings(bigint,uuid,text,jsonb,text) from public, anon, authenticated, service_role;
create function public.complete_extraction(job_id bigint, token uuid, source_text text, candidates jsonb, engine_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.complete_extraction_without_findings(job_id, token, source_text, candidates, engine_name);
  update public.reports r set findings=coalesce(candidate.value->>'findings','')
  from jsonb_array_elements(candidates) as candidate(value)
  where r.id=(candidate.value->>'id')::uuid and r.revision=0 and length(coalesce(candidate.value->>'findings',''))<=20000;
end $$;
revoke all on function public.complete_extraction(bigint,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.complete_extraction(bigint,uuid,text,jsonb,text) to service_role;
