-- Folio MVP. Apply to a Supabase PostgreSQL project. No patient fixtures.
create table public.documents (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), filename text not null,
 category text not null check(category in ('Laboratory','Imaging','Pathology','Procedures','Prescriptions','Consultations','Other')),
 uploaded_at timestamptz not null default now(), status text not null default 'uploading'
 check(status in ('uploading','queued','processing','review','ready','failed','deleting')),
 pages integer not null check(pages between 1 and 50), bytes bigint not null check(bytes between 1 and 26214400),
 object_key text not null unique, mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'), tags text[] not null default '{}',
 notes text not null default '', raw_text text not null default '', error text,
 storage_verified boolean not null default false, unique(owner_id,id), unique(owner_id,checksum)
);
create index documents_owner_date on public.documents(owner_id,uploaded_at desc);
create table public.reports (
 id uuid primary key, owner_id uuid not null, document_id uuid not null,
 kind text not null check(kind in ('lab','imaging','other')), panel text not null check(length(panel) between 1 and 120),
 examination_date date, date_reviewed boolean not null default false, facility text not null default '',
 body_region text not null default '', conclusion text not null default '', conclusion_reviewed boolean not null default false,
 revision integer not null default 0, unique(owner_id,id),
 foreign key(owner_id,document_id) references public.documents(owner_id,id) on delete cascade,
 check(not date_reviewed or examination_date is not null)
);
create index reports_owner_panel on public.reports(owner_id,panel,examination_date);
create table public.observations (
 id uuid primary key, owner_id uuid not null, report_id uuid not null,
 data jsonb not null check(jsonb_typeof(data)='object'),
 label text generated always as (data->>'label') stored,
 parameter_code text generated always as (data->>'parameter') stored,
 reported_value text generated always as (data->>'value') stored,
 reported_unit text generated always as (data->>'unit') stored,
 reference_text text generated always as (data->>'range') stored,
 foreign key(owner_id,report_id) references public.reports(owner_id,id) on delete cascade,
 check(length(data->>'label') between 1 and 160), check(length(data->>'value') <= 100),
 check((data->>'page')::integer between 1 and 50),
 check(data#>>'{review,value}' in ('pending','reviewed')),
 check(data#>>'{review,unit}' in ('pending','reviewed')),
 check(data#>>'{review,range}' in ('pending','reviewed')),
 check(data ?& array['label','parameter','value','unit','range','source','page','review'])
);
create index observations_report on public.observations(owner_id,report_id);
create table public.events (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), event_date date not null,
 event_time time, timezone text not null, end_date date, notes text not null default '', location text not null default '',
 reminder_minutes integer check(reminder_minutes between 0 and 10080),
 report_id uuid unique, document_id uuid,
 foreign key(owner_id,report_id) references public.reports(owner_id,id) on delete cascade,
 foreign key(owner_id,document_id) references public.documents(owner_id,id) on delete cascade,
 check(end_date is null or end_date>=event_date),
 check(reminder_minutes is null or event_time is not null)
);
create index events_owner_date on public.events(owner_id,event_date);
create table public.revisions (
 id bigint generated always as identity primary key, owner_id uuid not null,
 report_id uuid not null, revision integer not null, before_data jsonb, after_data jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(owner_id,report_id) references public.reports(owner_id,id) on delete cascade
);
create table public.jobs (
 id bigint generated always as identity primary key, owner_id uuid not null, document_id uuid not null unique,
 kind text not null default 'extract' check(kind in ('extract','delete')),
 status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts integer not null default 0, locked_at timestamptz, error_code text,
 lease_token uuid,
 foreign key(owner_id,document_id) references public.documents(owner_id,id) on delete cascade
);
create table public.extraction_runs (
 id bigint generated always as identity primary key, owner_id uuid not null, document_id uuid not null,
 engine text not null, raw_text text not null, candidates jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(owner_id,document_id) references public.documents(owner_id,id) on delete cascade
);

-- No client table writes. Writes go through bounded, ownership-checked RPCs.
do $$ declare t text; begin
 foreach t in array array['documents','reports','observations','events','revisions','jobs','extraction_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_mfa_select on public.%I for select to authenticated using (owner_id=auth.uid() and auth.jwt()->>''aal''=''aal2'')',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create function public.require_mfa() returns uuid language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'Complete authenticator verification first.' using errcode='42501'; end if;
 return auth.uid();
end $$;

create function public.get_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); result jsonb;
begin
 select jsonb_build_object(
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'filename',d.filename,'category',d.category,'uploadedAt',d.uploaded_at,'status',case when d.status='uploading' then 'queued' else d.status end,'pages',d.pages,'bytes',d.bytes,'objectKey',d.object_key,'mime',d.mime,'tags',d.tags,'notes',d.notes,'rawText',d.raw_text,'checksum',d.checksum,'error',d.error) order by d.uploaded_at desc) from public.documents d where d.owner_id=u and d.status<>'deleting'),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'documentId',r.document_id,'kind',r.kind,'panel',r.panel,'date',coalesce(r.examination_date::text,''),'dateReviewed',r.date_reviewed,'facility',r.facility,'bodyRegion',r.body_region,'conclusion',r.conclusion,'conclusionReviewed',r.conclusion_reviewed,'revision',r.revision,'observations',coalesce((select jsonb_agg(o.data||jsonb_build_object('id',o.id) order by o.id) from public.observations o where o.report_id=r.id and o.owner_id=u),'[]'::jsonb))) from public.reports r join public.documents d on d.id=r.document_id where r.owner_id=u and d.status<>'deleting'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',e.event_date,'time',coalesce(to_char(e.event_time,'HH24:MI'),''),'endDate',coalesce(e.end_date::text,''),'timezone',e.timezone,'notes',e.notes,'location',e.location,'reminderMinutes',e.reminder_minutes,'reportId',e.report_id,'documentId',e.document_id)) from public.events e where e.owner_id=u and (e.document_id is null or exists(select 1 from public.documents d where d.id=e.document_id and d.status<>'deleting'))),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.begin_upload(doc jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); did uuid := (doc->>'id')::uuid; previous public.documents;
begin
 if length(doc::text)>15000 then raise exception 'Metadata too large'; end if;
 select * into previous from public.documents where owner_id=u and checksum=doc->>'checksum' for update;
 if found then
  if previous.id=did or previous.status='uploading' then return previous.id; end if;
  raise exception 'This exact file is already in your documents.';
 end if;
 insert into public.documents(id,owner_id,title,filename,category,pages,bytes,object_key,mime,checksum)
 values(did,u,doc->>'title',doc->>'filename',doc->>'category',(doc->>'pages')::int,(doc->>'bytes')::bigint,u::text||'/'||did::text||'/original',doc->>'mime',doc->>'checksum');
 return did;
end $$;
create function public.finish_upload(doc_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 if exists(select 1 from public.documents where id=doc_id and owner_id=u and status in ('processing','review','ready','failed')) then return; end if;
 if not exists(select 1 from public.documents where id=doc_id and owner_id=u and status in ('uploading','queued')) then raise exception 'Upload not found'; end if;
 if not exists(select 1 from storage.objects s join public.documents d on d.object_key=s.name where d.id=doc_id and d.owner_id=u and s.bucket_id='medical-documents') then raise exception 'File storage has not been confirmed'; end if;
 update public.documents set status='queued' where id=doc_id and owner_id=u;
 insert into public.jobs(owner_id,document_id) values(u,doc_id) on conflict(document_id) do nothing;
end $$;
create function public.edit_document(doc_id uuid,new_title text,new_category text,new_notes text,new_tags text[]) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 if length(new_notes)>10000 or cardinality(new_tags)>30 then raise exception 'Notes or tags too long'; end if;
 update public.documents set title=new_title,category=new_category,notes=new_notes,tags=new_tags where id=doc_id and owner_id=u and status<>'deleting';
 if not found then raise exception 'Document not found'; end if;
end $$;

create function public.save_report(report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); rid uuid := (report->>'id')::uuid; did uuid := (report->>'documentId')::uuid;
 existing public.reports; obs jsonb; before_value jsonb; event_id uuid; ready boolean;
begin
 if length(report::text)>500000 or jsonb_array_length(report->'observations')>300 then raise exception 'Report too large'; end if;
 if jsonb_typeof(report->'observations') is distinct from 'array' or
    jsonb_typeof(report->'dateReviewed') is distinct from 'boolean' or
    jsonb_typeof(report->'conclusionReviewed') is distinct from 'boolean' or
    jsonb_typeof(report->'revision') is distinct from 'number' or
    (report->>'revision')::integer<0 or
    length(report->>'facility')>200 or length(report->>'bodyRegion')>160 or length(report->>'conclusion')>20000
 then raise exception 'Invalid report fields'; end if;
 perform 1 from public.documents where id=did and owner_id=u and status in ('review','ready','failed') for update;
 if not found then raise exception 'Document unavailable or still processing'; end if;
 select * into existing from public.reports where id=rid for update;
 if found then
  if existing.owner_id<>u or existing.document_id<>did then raise exception 'Report not found' using errcode='42501'; end if;
  if existing.revision<>(report->>'revision')::int then raise exception 'This report changed. Reload before saving.'; end if;
  select to_jsonb(existing)||jsonb_build_object('observations',coalesce(jsonb_agg(data),'[]'::jsonb)) into before_value from public.observations where report_id=rid and owner_id=u;
 end if;
 insert into public.reports(id,owner_id,document_id,kind,panel,examination_date,date_reviewed,facility,body_region,conclusion,conclusion_reviewed,revision)
 values(rid,u,did,report->>'kind',report->>'panel',nullif(report->>'date','')::date,(report->>'dateReviewed')::boolean,report->>'facility',report->>'bodyRegion',report->>'conclusion',(report->>'conclusionReviewed')::boolean,coalesce(existing.revision,0)+1)
 on conflict(id) do update set kind=excluded.kind,panel=excluded.panel,examination_date=excluded.examination_date,date_reviewed=excluded.date_reviewed,facility=excluded.facility,body_region=excluded.body_region,conclusion=excluded.conclusion,conclusion_reviewed=excluded.conclusion_reviewed,revision=excluded.revision;
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

create function public.save_event(event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); eid uuid := (event->>'id')::uuid;
begin
 if length(event::text)>10000 or event->>'reportId' is not null or event->>'documentId' is not null then raise exception 'Invalid manual event'; end if;
 if not exists(select 1 from pg_timezone_names where name=event->>'timezone') then raise exception 'Unknown time zone'; end if;
 if exists(select 1 from public.events where id=eid and (owner_id<>u or report_id is not null)) then raise exception 'Event unavailable' using errcode='42501'; end if;
 insert into public.events(id,owner_id,title,event_date,event_time,timezone,end_date,notes,location,reminder_minutes)
 values(eid,u,event->>'title',(event->>'date')::date,nullif(event->>'time','')::time,event->>'timezone',nullif(event->>'endDate','')::date,event->>'notes',event->>'location',(event->>'reminderMinutes')::integer)
 on conflict(id) do update set title=excluded.title,event_date=excluded.event_date,event_time=excluded.event_time,timezone=excluded.timezone,end_date=excluded.end_date,notes=excluded.notes,location=excluded.location,reminder_minutes=excluded.reminder_minutes;
end $$;
create function public.delete_event(event_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.events where id=event_id and owner_id=public.require_mfa() and report_id is null; end $$;
create function public.request_document_deletion(doc_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 update public.documents set status='deleting' where id=doc_id and owner_id=u;
 if not found then raise exception 'Document not found'; end if;
 insert into public.jobs(owner_id,document_id,kind) values(u,doc_id,'delete')
 on conflict(document_id) do update set kind='delete',status='queued',attempts=0,locked_at=null,lease_token=null;
end $$;
create function public.retry_processing(doc_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
 update public.documents set status='queued',error=null where id=doc_id and owner_id=u and status='failed';
 if not found then raise exception 'No failed processing to retry'; end if;
 update public.jobs set status='queued',attempts=0,error_code=null,lease_token=null where document_id=doc_id and owner_id=u and kind='extract';
end $$;

-- Service-only worker functions. Leasing guards stale workers and deletion races.
create function public.claim_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 -- A worker crash on its final attempt must become a visible, retryable failure.
 with exhausted as (
  update public.jobs set status='failed',error_code='Processing interrupted. Retry extraction.',lease_token=null
  where status='running' and locked_at<now()-interval '10 minutes' and attempts>=3 and kind='extract'
  returning document_id
 ) update public.documents set status='failed',error='Processing interrupted. Retry extraction.'
   where id in (select document_id from exhausted) and status<>'deleting';
 select * into j from public.jobs where (status='queued' or (status='running' and locked_at<now()-interval '10 minutes')) and attempts<3 order by id for update skip locked limit 1;
 if not found then return null; end if;
 update public.jobs set status='running',locked_at=now(),attempts=attempts+1,lease_token=gen_random_uuid() where id=j.id returning * into j;
 if j.kind='extract' then update public.documents set status='processing' where id=j.document_id and status<>'deleting'; end if;
 return to_jsonb(j)||jsonb_build_object('document',(select to_jsonb(d) from public.documents d where d.id=j.document_id));
end $$;
create function public.complete_extraction(job_id bigint, token uuid, source_text text, candidates jsonb, engine_name text) returns void language plpgsql security definer set search_path='' as $$
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
   insert into public.reports(id,owner_id,document_id,kind,panel,examination_date,facility,body_region,conclusion)
   values(rid,j.owner_id,j.document_id,candidate->>'kind',candidate->>'panel',nullif(candidate->>'date','')::date,coalesce(candidate->>'facility',''),coalesce(candidate->>'bodyRegion',''),coalesce(candidate->>'conclusion',''));
   for obs in select value from jsonb_array_elements(candidate->'observations') loop
    insert into public.observations(id,owner_id,report_id,data) values((obs->>'id')::uuid,j.owner_id,rid,jsonb_set(obs,'{review}','{"value":"pending","unit":"pending","range":"pending"}'::jsonb));
   end loop;
  end loop;
 end if;
 update public.documents set raw_text=source_text,status='review',error=null,storage_verified=true where id=j.document_id;
 update public.jobs set status='done' where id=job_id;
end $$;
create function public.fail_job(job_id bigint,token uuid,error_message text) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 select * into j from public.jobs where id=job_id and lease_token=token and status='running' for update;
 if not found then return; end if;
 update public.jobs set status='failed',error_code=left(error_message,300) where id=job_id;
 update public.documents set status=case when j.kind='delete' then 'deleting' else 'failed' end,error=left(error_message,300) where id=j.document_id and status<>'deleting';
end $$;

revoke all on function public.require_mfa(),public.get_snapshot(),public.begin_upload(jsonb),public.finish_upload(uuid),public.edit_document(uuid,text,text,text,text[]),public.save_report(jsonb),public.save_event(jsonb),public.delete_event(uuid),public.request_document_deletion(uuid),public.retry_processing(uuid),public.claim_job(),public.complete_extraction(bigint,uuid,text,jsonb,text),public.fail_job(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.require_mfa(),public.get_snapshot(),public.begin_upload(jsonb),public.finish_upload(uuid),public.edit_document(uuid,text,text,text,text[]),public.save_report(jsonb),public.save_event(jsonb),public.delete_event(uuid),public.request_document_deletion(uuid),public.retry_processing(uuid) to authenticated;
grant execute on function public.claim_job(),public.complete_extraction(bigint,uuid,text,jsonb,text),public.fail_job(bigint,uuid,text) to service_role;
grant all on public.documents,public.reports,public.observations,public.events,public.jobs,public.extraction_runs,public.revisions to service_role;
grant usage,select on sequence public.jobs_id_seq,public.extraction_runs_id_seq,public.revisions_id_seq to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('medical-documents','medical-documents',false,26214400,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy folio_upload on storage.objects for insert to authenticated with check(
 bucket_id='medical-documents' and auth.jwt()->>'aal'='aal2' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'));
create policy folio_upload_retry on storage.objects for update to authenticated using(
 bucket_id='medical-documents' and auth.jwt()->>'aal'='aal2' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'))
 with check(bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'));
create policy folio_read on storage.objects for select to authenticated using(
 bucket_id='medical-documents' and auth.jwt()->>'aal'='aal2' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status<>'deleting' and (d.storage_verified or d.status='uploading')));
