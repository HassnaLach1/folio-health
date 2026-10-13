-- Store the reported doctor separately from the facility and expose it in review.
alter table public.reports add column doctor text not null default '';
alter table public.reports add constraint reports_doctor_length check (length(doctor)<=200);

create or replace function public.get_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); result jsonb;
begin
 select jsonb_build_object(
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'filename',d.filename,'category',d.category,'uploadedAt',d.uploaded_at,'status',case when d.status='uploading' then 'queued' else d.status end,'pages',d.pages,'bytes',d.bytes,'objectKey',d.object_key,'mime',d.mime,'tags',d.tags,'notes',d.notes,'rawText',d.raw_text,'checksum',d.checksum,'error',d.error) order by d.uploaded_at desc) from public.documents d where d.owner_id=u and d.status<>'deleting'),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'documentId',r.document_id,'kind',r.kind,'panel',r.panel,'date',coalesce(r.examination_date::text,''),'dateReviewed',r.date_reviewed,'facility',r.facility,'doctor',r.doctor,'bodyRegion',r.body_region,'conclusion',r.conclusion,'conclusionReviewed',r.conclusion_reviewed,'revision',r.revision,'observations',coalesce((select jsonb_agg(o.data||jsonb_build_object('id',o.id) order by o.id) from public.observations o where o.report_id=r.id and o.owner_id=u),'[]'::jsonb))) from public.reports r join public.documents d on d.id=r.document_id where r.owner_id=u and d.status<>'deleting'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',e.event_date,'time',coalesce(to_char(e.event_time,'HH24:MI'),''),'endDate',coalesce(e.end_date::text,''),'timezone',e.timezone,'notes',e.notes,'location',e.location,'reminderMinutes',e.reminder_minutes,'reportId',e.report_id,'documentId',e.document_id)) from public.events e where e.owner_id=u and (e.document_id is null or exists(select 1 from public.documents d where d.id=e.document_id and d.status<>'deleting'))),'[]'::jsonb)
 ) into result;
 return result;
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
  values(gen_random_uuid(),u,report->>'panel',(report->>'date')::date,'UTC',report->>'facility',rid,did)
  on conflict(report_id) do update set title=excluded.title,event_date=excluded.event_date,location=excluded.location;
 else
  delete from public.events where report_id=rid and owner_id=u;
 end if;
 select not exists(select 1 from public.reports r where r.document_id=did and
  (not r.date_reviewed or (r.kind<>'lab' and not r.conclusion_reviewed) or (r.kind='lab' and
   (not exists(select 1 from public.observations o where o.report_id=r.id) or exists(select 1 from public.observations o where o.report_id=r.id and (o.data#>>'{review,value}'<>'reviewed' or o.data#>>'{review,unit}'<>'reviewed' or o.data#>>'{review,range}'<>'reviewed')))))) into ready;
 update public.documents set status=case when ready then 'ready' else 'review' end where id=did and owner_id=u;
end $$;

create or replace function public.complete_extraction(job_id bigint, token uuid, source_text text, candidates jsonb, engine_name text) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; candidate jsonb; obs jsonb; rid uuid;
begin
 select * into j from public.jobs where id=job_id and lease_token=token and status='running' and kind='extract' for update;
 if not found then raise exception 'Job lease expired'; end if;
 perform 1 from public.documents where id=j.document_id and status<>'deleting' for update;
 if not found then raise exception 'Document deleted'; end if;
 insert into public.extraction_runs(owner_id,document_id,engine,raw_text,candidates) values(j.owner_id,j.document_id,engine_name,source_text,candidates);
 -- Retries/reprocessing never overwrite existing reports or user corrections.
 if not exists(select 1 from public.reports where document_id=j.document_id) then
  for candidate in select value from jsonb_array_elements(candidates) loop
   rid := (candidate->>'id')::uuid;
   insert into public.reports(id,owner_id,document_id,kind,panel,examination_date,facility,doctor,body_region,conclusion)
   values(rid,j.owner_id,j.document_id,candidate->>'kind',candidate->>'panel',nullif(candidate->>'date','')::date,coalesce(candidate->>'facility',''),coalesce(candidate->>'doctor',''),coalesce(candidate->>'bodyRegion',''),coalesce(candidate->>'conclusion',''));
   for obs in select value from jsonb_array_elements(candidate->'observations') loop
    insert into public.observations(id,owner_id,report_id,data) values((obs->>'id')::uuid,j.owner_id,rid,jsonb_set(obs,'{review}','{"value":"pending","unit":"pending","range":"pending"}'::jsonb));
   end loop;
  end loop;
 end if;
 update public.documents d set raw_text=source_text,status='review',error=null,storage_verified=true,
   title=case when (lower(d.title)=lower(regexp_replace(d.filename,'\.[^.]+$','')) or lower(d.title)='scanned report')
     and coalesce(candidates->0->>'panel','') not in ('','Report','Laboratory results')
     then left(candidates->0->>'panel',200) else d.title end
 where d.id=j.document_id;
 update public.jobs set status='done' where id=job_id;
end $$;

