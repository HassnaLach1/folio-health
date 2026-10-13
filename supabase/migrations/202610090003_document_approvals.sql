-- Approval is an explicit user action, separate from saving individual details.
create table public.document_approvals (
  document_id uuid primary key,
  owner_id uuid not null,
  approved_at timestamptz not null default now(),
  calendar_event_id uuid not null unique,
  foreign key(owner_id,document_id) references public.documents(owner_id,id) on delete cascade
);
alter table public.document_approvals enable row level security;
create policy own_mfa_select on public.document_approvals for select to authenticated
  using(owner_id=auth.uid() and auth.jwt()->>'aal'='aal2');
revoke all on public.document_approvals from anon,authenticated;
grant select on public.document_approvals to authenticated;
grant all on public.document_approvals to service_role;

create function public.invalidate_document_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare did uuid; event_id uuid;
begin
  if tg_table_name='reports' then did:=coalesce(new.document_id,old.document_id);
  else select r.document_id into did from public.reports r where r.id=coalesce(new.report_id,old.report_id); end if;
  if did is not null then
    select a.calendar_event_id into event_id from public.document_approvals a where a.document_id=did;
    if event_id is not null then
      delete from public.document_approvals where document_id=did;
      delete from public.events where id=event_id and document_id=did and report_id is null;
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger reports_invalidate_approval after insert or update or delete on public.reports
  for each row execute function public.invalidate_document_approval();
create trigger observations_invalidate_approval after insert or update or delete on public.observations
  for each row execute function public.invalidate_document_approval();

create function public.require_explicit_document_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='ready' and not exists(select 1 from public.document_approvals where document_id=new.id) then
    new.status:='review';
  end if;
  return new;
end $$;
create trigger documents_require_approval before insert or update of status on public.documents
  for each row execute function public.require_explicit_document_approval();

create function public.approve_document(doc_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); d public.documents; r public.reports; event_id uuid; approval_date date:=(now() at time zone 'Africa/Casablanca')::date;
begin
  select * into d from public.documents where id=doc_id and owner_id=u and status in ('review','ready') for update;
  if not found then raise exception 'Document must be ready for review before approval'; end if;

  -- Approval confirms any entered examination dates, with a revision record.
  for r in select * from public.reports where document_id=doc_id and owner_id=u and examination_date is not null for update loop
    if not r.date_reviewed then
      insert into public.revisions(owner_id,report_id,revision,before_data,after_data)
      values(u,r.id,r.revision+1,to_jsonb(r),to_jsonb(r)||jsonb_build_object('date_reviewed',true,'revision',r.revision+1));
      update public.reports set date_reviewed=true,revision=revision+1 where id=r.id and owner_id=u;
    end if;
    insert into public.events(id,owner_id,title,event_date,timezone,location,report_id,document_id)
    values(gen_random_uuid(),u,r.panel,r.examination_date,'Africa/Casablanca',r.facility,r.id,doc_id)
    on conflict(report_id) do update set title=excluded.title,event_date=excluded.event_date,location=excluded.location;
  end loop;

  select calendar_event_id into event_id from public.document_approvals where document_id=doc_id and owner_id=u;
  if event_id is null then event_id:=gen_random_uuid(); end if;
  insert into public.events(id,owner_id,title,event_date,timezone,notes,document_id)
  values(event_id,u,left('Approved document: '||d.title,160),approval_date,'Africa/Casablanca',
    'Document approved on this date. Examination dates, when entered, appear separately.',doc_id)
  on conflict(id) do update set title=excluded.title,event_date=excluded.event_date,notes=excluded.notes;
  insert into public.document_approvals(document_id,owner_id,approved_at,calendar_event_id)
  values(doc_id,u,now(),event_id)
  on conflict(document_id) do update set approved_at=excluded.approved_at,calendar_event_id=excluded.calendar_event_id;
  update public.documents set status='ready' where id=doc_id and owner_id=u;
end $$;
revoke all on function public.invalidate_document_approval(),public.require_explicit_document_approval(),public.approve_document(uuid) from public,anon,authenticated;
grant execute on function public.approve_document(uuid) to authenticated;
