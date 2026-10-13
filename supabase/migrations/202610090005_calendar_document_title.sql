-- Use the editable document title for its dated calendar event and keep existing entries in sync.
create or replace function public.edit_document(doc_id uuid,new_title text,new_category text,new_notes text,new_tags text[]) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 if length(new_notes)>10000 or cardinality(new_tags)>30 then raise exception 'Notes or tags too long'; end if;
 update public.documents set title=new_title,category=new_category,notes=new_notes,tags=new_tags where id=doc_id and owner_id=u and status<>'deleting';
 if not found then raise exception 'Document not found'; end if;
 update public.events set title=left(new_title,160) where document_id=doc_id and owner_id=u;
end $$;

create or replace function public.save_report(report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); rid uuid := (report->>'id')::uuid; did uuid := (report->>'documentId')::uuid;
 existing public.reports; obs jsonb; before_value jsonb; event_id uuid; ready boolean;
begin
 if length(report::text)>500000 or jsonb_array_length(report->'observations')>300 then raise exception 'Report too large'; end if;
 if jsonb_typeof(report->'observations') is distinct from 'array' or
    jsonb_typeof(report->'dateReviewed') is distinct from 'boolean' or
    jsonb_typeof(report->'conclusionReviewed') is distinct from 'boolean' or
    jsonb_typeof(report->'revision') is distinct from 'number' or
    (report->>'revision')::integer<0 or
    length(report->>'facility')>200 or length(coalesce(report->>'doctor',''))>200 or length(report->>'bodyRegion')>160 or length(report->>'conclusion')>20000
 then raise exception 'Invalid report fields'; end if;
 perform 1 from public.documents where id=did and owner_id=u and status in ('review','ready','failed') for update;
 if not found then raise exception 'Document unavailable or still processing'; end if;
 select * into existing from public.reports where id=rid for update;
 if found then
  if existing.owner_id<>u or existing.document_id<>did then raise exception 'Report not found' using errcode='42501'; end if;
  if existing.revision<>(report->>'revision')::int then raise exception 'This report changed. Reload before saving.'; end if;
  select to_jsonb(existing)||jsonb_build_object('observations',coalesce(jsonb_agg(data),'[]'::jsonb)) into before_value from public.observations where report_id=rid and owner_id=u;
 end if;
 insert into public.reports(id,owner_id,document_id,kind,panel,examination_date,date_reviewed,facility,doctor,body_region,conclusion,conclusion_reviewed,revision)
 values(rid,u,did,report->>'kind',report->>'panel',nullif(report->>'date','')::date,(report->>'dateReviewed')::boolean,report->>'facility',coalesce(report->>'doctor',''),report->>'bodyRegion',report->>'conclusion',(report->>'conclusionReviewed')::boolean,coalesce(existing.revision,0)+1)
 on conflict(id) do update set kind=excluded.kind,panel=excluded.panel,examination_date=excluded.examination_date,date_reviewed=excluded.date_reviewed,facility=excluded.facility,doctor=excluded.doctor,body_region=excluded.body_region,conclusion=excluded.conclusion,conclusion_reviewed=excluded.conclusion_reviewed,revision=excluded.revision;
 delete from public.observations where report_id=rid and owner_id=u;
 for obs in select value from jsonb_array_elements(report->'observations') loop
  if jsonb_typeof(obs->'review') is distinct from 'object' or
     coalesce(obs#>>'{review,value}','') not in ('pending','reviewed') or
     coalesce(obs#>>'{review,unit}','') not in ('pending','reviewed') or
     coalesce(obs#>>'{review,range}','') not in ('pending','reviewed') or
     jsonb_typeof(obs->'label') is distinct from 'string' or
     jsonb_typeof(obs->'value') is distinct from 'string' or
     jsonb_typeof(obs->'unit') is distinct from 'string' or
     jsonb_typeof(obs->'range') is distinct from 'string' or
     jsonb_typeof(obs->'source') is distinct from 'string' or
     jsonb_typeof(obs->'parameter') is distinct from 'string' or
     length(obs->>'unit')>80 or length(obs->>'range')>400 or length(obs->>'source')>4000 or length(obs->>'parameter')>120
  then raise exception 'Invalid observation fields'; end if;
  insert into public.observations(id,owner_id,report_id,data) values((obs->>'id')::uuid,u,rid,obs);
 end loop;
 insert into public.revisions(owner_id,report_id,revision,before_data,after_data) values(u,rid,coalesce(existing.revision,0)+1,before_value,report);
 if (report->>'dateReviewed')::boolean then
  insert into public.events(id,owner_id,title,event_date,timezone,location,report_id,document_id)
  values(gen_random_uuid(),u,(select left(title,160) from public.documents where id=did),(report->>'date')::date,'UTC',report->>'facility',rid,did)
  on conflict(report_id) do update set title=excluded.title,event_date=excluded.event_date,location=excluded.location;
 else
  delete from public.events where report_id=rid and owner_id=u;
 end if;
 select not exists(select 1 from public.reports r where r.document_id=did and
  (not r.date_reviewed or (r.kind<>'lab' and not r.conclusion_reviewed) or (r.kind='lab' and
   r.conclusion<>'' and not r.conclusion_reviewed) or (r.kind='lab' and
   (not exists(select 1 from public.observations o where o.report_id=r.id) or exists(select 1 from public.observations o where o.report_id=r.id and (o.data#>>'{review,value}'<>'reviewed' or o.data#>>'{review,unit}'<>'reviewed' or o.data#>>'{review,range}'<>'reviewed')))))) into ready;
 update public.documents set status=case when ready then 'ready' else 'review' end where id=did and owner_id=u;
end $$;

create or replace function public.approve_document(doc_id uuid) returns void
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
    values(gen_random_uuid(),u,left(d.title,160),r.examination_date,'Africa/Casablanca',r.facility,r.id,doc_id)
    on conflict(report_id) do update set title=excluded.title,event_date=excluded.event_date,location=excluded.location;
  end loop;

  select calendar_event_id into event_id from public.document_approvals where document_id=doc_id and owner_id=u;
  if event_id is null then event_id:=gen_random_uuid(); end if;
  insert into public.events(id,owner_id,title,event_date,timezone,notes,document_id)
  values(event_id,u,left(d.title,160),approval_date,'Africa/Casablanca',
    'Document approved on this date. Examination dates, when entered, appear separately.',doc_id)
  on conflict(id) do update set title=excluded.title,event_date=excluded.event_date,notes=excluded.notes;
  insert into public.document_approvals(document_id,owner_id,approved_at,calendar_event_id)
  values(doc_id,u,now(),event_id)
  on conflict(document_id) do update set approved_at=excluded.approved_at,calendar_event_id=excluded.calendar_event_id;
  update public.documents set status='ready' where id=doc_id and owner_id=u;
end $$;

