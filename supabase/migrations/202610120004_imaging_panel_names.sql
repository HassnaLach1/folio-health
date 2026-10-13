-- Older imaging records may have a printed name but no generated panel code.
create function public.imaging_panel_key(code text,panel text) returns text
language sql immutable set search_path='' as $$
 select coalesce(nullif(code,''),trim(both '_' from regexp_replace(lower(translate(trim(panel),'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ','AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),'[^a-z0-9]+','_','g')));
$$;
revoke all on function public.imaging_panel_key(text,text) from public,anon,authenticated;
create or replace function public.request_imaging_comparison(earlier uuid,later uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); a public.reports; b public.reports; result uuid; facts jsonb;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 select * into a from public.reports where id=earlier and owner_id=u;
 select * into b from public.reports where id=later and owner_id=u;
 if a.id is null or b.id is null or a.id=b.id or a.kind<>'imaging' or b.kind<>'imaging' then raise exception 'Choose two imaging reports'; end if;
 if public.imaging_panel_key(a.panel_code,a.panel)<>public.imaging_panel_key(b.panel_code,b.panel) or lower(trim(a.body_region))<>lower(trim(b.body_region)) then raise exception 'Choose the same study type and body region'; end if;
 if not a.conclusion_reviewed or not b.conclusion_reviewed or not a.date_reviewed or not b.date_reviewed then raise exception 'Review both reports and their examination dates first'; end if;
 if a.examination_date>b.examination_date then raise exception 'Choose the earlier report first'; end if;
 if (a.conclusion='' and a.findings='') or (b.conclusion='' and b.findings='') then raise exception 'Both reports need a conclusion or description'; end if;
 select id into result from public.imaging_comparisons where owner_id=u and earlier_id=a.id and later_id=b.id and earlier_revision=a.revision and later_revision=b.revision and status<>'failed';
 if result is not null then return result; end if;
 if (select count(*) from public.imaging_comparisons where owner_id=u and status in ('queued','running'))>=5 then raise exception 'Please wait for your pending comparisons'; end if;
 facts := jsonb_build_array(jsonb_build_object('date',a.examination_date,'panel',a.panel,'bodyRegion',a.body_region,'conclusion',a.conclusion,'findings',a.findings),jsonb_build_object('date',b.examination_date,'panel',b.panel,'bodyRegion',b.body_region,'conclusion',b.conclusion,'findings',b.findings));
 insert into public.imaging_comparisons(owner_id,earlier_id,later_id,earlier_revision,later_revision,source_reports)
 values(u,a.id,b.id,a.revision,b.revision,facts)
 on conflict(owner_id,earlier_id,later_id,earlier_revision,later_revision) do update set status='queued',summary=null,attempts=0,created_at=now()
 returning id into result;
 return result;
end $$;
