-- An owner can leave the extraction queue and review the source by hand.
create function public.start_manual_review(doc_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa();
begin
  perform 1 from public.jobs where document_id=doc_id and owner_id=u and kind='extract' for update;
  perform 1 from public.documents where id=doc_id and owner_id=u and status in ('queued','processing','failed') for update;
  if not found then raise exception 'Document is not waiting for extraction'; end if;
  update public.jobs set status='done',lease_token=null where document_id=doc_id and owner_id=u and kind='extract';
  update public.documents set status='review',error=null where id=doc_id and owner_id=u;
end $$;
revoke all on function public.start_manual_review(uuid) from public,anon,authenticated;
grant execute on function public.start_manual_review(uuid) to authenticated;
