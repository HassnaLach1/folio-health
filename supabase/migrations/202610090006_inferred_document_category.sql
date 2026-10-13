-- Store the category inferred from the report contents alongside the extracted details.
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
   category=case candidates->0->>'kind' when 'lab' then 'Laboratory' when 'imaging' then 'Imaging' else d.category end,
   title=case when (lower(d.title)=lower(regexp_replace(d.filename,'\.[^.]+$','')) or lower(d.title)='scanned report')
     and coalesce(candidates->0->>'panel','') not in ('','Report','Laboratory results')
     then left(candidates->0->>'panel',200) else d.title end
 where d.id=j.document_id;
 update public.jobs set status='done' where id=job_id;
end $$;
