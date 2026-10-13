-- Allow source documents to be reviewed by hand while extraction is disabled.
create function public.finish_upload_manual(doc_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
  if exists(select 1 from public.documents where id=doc_id and owner_id=u and status in ('review','ready')) then return; end if;
  if not exists(select 1 from public.documents where id=doc_id and owner_id=u and status='uploading') then raise exception 'Upload not found'; end if;
  if not exists(select 1 from storage.objects s join public.documents d on d.object_key=s.name where d.id=doc_id and d.owner_id=u and s.bucket_id='medical-documents') then raise exception 'File storage has not been confirmed'; end if;
  update public.documents set status='review' where id=doc_id and owner_id=u;
end $$;
revoke all on function public.finish_upload_manual(uuid) from public,anon,authenticated;
grant execute on function public.finish_upload_manual(uuid) to authenticated;

drop policy folio_read on storage.objects;
create policy folio_read on storage.objects for select to authenticated using(
  bucket_id='medical-documents' and auth.jwt()->>'aal'='aal2' and
  exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid() and
    d.status<>'deleting' and (d.storage_verified or d.status in ('uploading','review','ready'))));

-- A person may delete their own original without an extraction worker.
create policy folio_delete on storage.objects for delete to authenticated using(
  bucket_id='medical-documents' and auth.jwt()->>'aal'='aal2' and
  exists(select 1 from public.documents d where d.object_key=name and d.owner_id=auth.uid()));
create function public.delete_document_manual(doc_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); key text;
begin
  select object_key into key from public.documents where id=doc_id and owner_id=u for update;
  if not found then raise exception 'Document not found'; end if;
  if exists(select 1 from storage.objects where bucket_id='medical-documents' and name=key) then raise exception 'Remove the original file first'; end if;
  delete from public.documents where id=doc_id and owner_id=u;
end $$;
revoke all on function public.delete_document_manual(uuid) from public,anon,authenticated;
grant execute on function public.delete_document_manual(uuid) to authenticated;
