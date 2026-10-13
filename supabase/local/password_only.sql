-- Local development override. Never apply to a hosted project with real records.
create or replace function public.require_mfa() returns uuid
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  return auth.uid();
end $$;

do $$ declare t text; begin
  foreach t in array array['documents','reports','observations','events','revisions','jobs','extraction_runs','document_approvals'] loop
    execute format('drop policy if exists own_mfa_select on public.%I', t);
    execute format('drop policy if exists own_select on public.%I', t);
    execute format('create policy own_select on public.%I for select to authenticated using (owner_id=auth.uid())', t);
  end loop;
end $$;

drop policy if exists folio_upload on storage.objects;
create policy folio_upload on storage.objects for insert to authenticated with check(
  bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'));
drop policy if exists folio_upload_retry on storage.objects;
create policy folio_upload_retry on storage.objects for update to authenticated using(
  bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'))
  with check(bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and d.status='uploading'));
drop policy if exists folio_read on storage.objects;
create policy folio_read on storage.objects for select to authenticated using(
  bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and
    d.status<>'deleting' and (d.storage_verified or d.status in ('uploading','review','ready'))));
drop policy if exists folio_delete on storage.objects;
create policy folio_delete on storage.objects for delete to authenticated using(
  bucket_id='medical-documents' and exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid()));
