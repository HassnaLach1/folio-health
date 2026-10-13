-- A manually entered care record is one event, displayed in both Documents and Calendar.
alter table public.events add column event_type text not null default 'Other' check(event_type in ('Procedure','Prescription','Consultation','Other'));
alter table public.events add column doctor text not null default '' check(length(doctor)<=200);
alter table public.events add column medications text not null default '' check(length(medications)<=4000);
alter function public.save_event(jsonb) rename to save_event_without_care;
revoke all on function public.save_event_without_care(jsonb) from public,anon,authenticated;
create function public.save_event(event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); kind text := coalesce(event->>'eventType','Other');
begin
 if kind not in ('Procedure','Prescription','Consultation','Other') or length(coalesce(event->>'doctor',''))>200 or length(coalesce(event->>'medications',''))>4000 then raise exception 'Invalid care details'; end if;
 if kind='Prescription' and trim(coalesce(event->>'medications',''))='' then raise exception 'Enter the prescribed medications'; end if;
 perform public.save_event_without_care(event);
 update public.events set event_type=kind,doctor=coalesce(event->>'doctor',''),medications=case when kind='Prescription' then coalesce(event->>'medications','') else '' end where id=(event->>'id')::uuid and owner_id=u;
end $$;
revoke all on function public.save_event(jsonb) from public,anon;
grant execute on function public.save_event(jsonb) to authenticated;

alter function public.get_snapshot() rename to get_snapshot_without_care;
revoke all on function public.get_snapshot_without_care() from public,anon,authenticated;
create function public.get_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; u uuid := public.require_mfa();
begin
 snapshot := public.get_snapshot_without_care();
 return jsonb_set(snapshot,'{events}',coalesce((select jsonb_agg(item.value || jsonb_build_object(
  'eventType',case d.category when 'Procedures' then 'Procedure' when 'Prescriptions' then 'Prescription' when 'Consultations' then 'Consultation' else e.event_type end,
  'doctor',coalesce(r.doctor,e.doctor), 'medications',case when d.category='Prescriptions' then coalesce(r.findings,'') else e.medications end,
  'notes',case when d.category='Consultations' then coalesce(r.findings,'') else e.notes end))
 from jsonb_array_elements(snapshot->'events') item(value) join public.events e on e.id=(item.value->>'id')::uuid and e.owner_id=u
 left join public.reports r on r.id=e.report_id and r.owner_id=u left join public.documents d on d.id=e.document_id and d.owner_id=u),'[]'::jsonb));
end $$;
revoke all on function public.get_snapshot() from public,anon;
grant execute on function public.get_snapshot() to authenticated;
