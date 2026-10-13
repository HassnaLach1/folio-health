-- An approval is audit state, not a medical event. Only a confirmed examination date
-- can place a document on the calendar.
delete from public.events e using public.document_approvals a
where e.id = a.calendar_event_id and e.report_id is null;
alter table public.document_approvals alter column calendar_event_id drop not null;
update public.document_approvals set calendar_event_id = null;

create or replace function public.invalidate_document_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare did uuid;
begin
  if tg_table_name='reports' then did:=coalesce(new.document_id,old.document_id);
  else select r.document_id into did from public.reports r where r.id=coalesce(new.report_id,old.report_id); end if;
  if did is not null then delete from public.document_approvals where document_id=did; end if;
  return coalesce(new,old);
end $$;

create or replace function public.approve_document(doc_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); d public.documents; r public.reports;
begin
  select * into d from public.documents where id=doc_id and owner_id=u and status in ('review','ready') for update;
  if not found then raise exception 'Document must be ready for review before approval'; end if;
  for r in select * from public.reports where document_id=doc_id and owner_id=u and examination_date is not null for update loop
    if not r.date_reviewed then
      insert into public.revisions(owner_id,report_id,revision,before_data,after_data)
      values(u,r.id,r.revision+1,to_jsonb(r),to_jsonb(r)||jsonb_build_object('date_reviewed',true,'revision',r.revision+1));
      update public.reports set date_reviewed=true,revision=revision+1 where id=r.id and owner_id=u;
    end if;
    insert into public.events(id,owner_id,title,event_date,timezone,location,report_id,document_id)
    values(gen_random_uuid(),u,left(d.title,160),r.examination_date,'Africa/Casablanca',r.facility,r.id,doc_id)
    on conflict(report_id) do update set title=excluded.title,event_date=excluded.event_date,location=excluded.location;
  end loop;
  insert into public.document_approvals(document_id,owner_id,approved_at,calendar_event_id)
  values(doc_id,u,now(),null)
  on conflict(document_id) do update set approved_at=excluded.approved_at,calendar_event_id=null;
  update public.documents set status='ready' where id=doc_id and owner_id=u;
end $$;
