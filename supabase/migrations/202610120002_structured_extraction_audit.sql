-- Preserve the validated native model JSON, including nulls, separately from
-- legacy editable fields which use blank text for missing source details.
alter table public.extraction_runs add column structured_output jsonb;
alter function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) rename to complete_extraction_without_structured_audit;
revoke all on function public.complete_extraction_without_structured_audit(bigint,uuid,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create function public.complete_extraction(job_id bigint,token uuid,source_text text,candidates jsonb,engine_name text,document_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.jobs; structured jsonb := document_metadata->'structuredOutput';
begin
 select * into j from public.jobs where id=job_id and lease_token=token and status='running' and kind='extract' for update;
 if not found then raise exception 'Job lease expired'; end if;
 if structured is not null and (jsonb_typeof(structured)<>'object' or length(structured::text)>1000000) then raise exception 'Invalid structured extraction'; end if;
 perform public.complete_extraction_without_structured_audit(job_id,token,source_text,candidates,engine_name,document_metadata);
 update public.extraction_runs set structured_output=structured where id=(
  select max(id) from public.extraction_runs where document_id=j.document_id and owner_id=j.owner_id
 );
end $$;
revoke all on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_extraction(bigint,uuid,text,jsonb,text,jsonb) to service_role;
