-- User-requested, revision-bound AI comparisons. Model credentials stay in the worker.
create table public.imaging_comparisons (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 earlier_id uuid not null references public.reports(id) on delete cascade,
 later_id uuid not null references public.reports(id) on delete cascade,
 earlier_revision integer not null, later_revision integer not null,
 source_reports jsonb not null, status text not null default 'queued' check(status in ('queued','running','done','failed')),
 summary text check(length(summary)<=2500), lease_token uuid, leased_until timestamptz,
 attempts integer not null default 0, created_at timestamptz not null default now(),
 unique(owner_id,earlier_id,later_id,earlier_revision,later_revision)
);
alter table public.imaging_comparisons enable row level security;
grant all on public.imaging_comparisons to service_role;

create function public.request_imaging_comparison(earlier uuid,later uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); a public.reports; b public.reports; result uuid; facts jsonb;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'Enable AI interpretation first'; end if;
 select * into a from public.reports where id=earlier and owner_id=u;
 select * into b from public.reports where id=later and owner_id=u;
 if a.id is null or b.id is null or a.id=b.id or a.kind<>'imaging' or b.kind<>'imaging' then raise exception 'Choose two imaging reports'; end if;
 if lower(coalesce(nullif(a.panel_code,''),a.panel))<>lower(coalesce(nullif(b.panel_code,''),b.panel)) or lower(trim(a.body_region))<>lower(trim(b.body_region)) then raise exception 'Choose the same study type and body region'; end if;
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

create function public.get_imaging_comparison(comparison_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := public.require_mfa(); c public.imaging_comparisons;
begin
 if not coalesce((select show_ai_interpretation from public.user_preferences where owner_id=u),false) then raise exception 'AI interpretation is hidden'; end if;
 select * into c from public.imaging_comparisons where id=comparison_id and owner_id=u;
 if c.id is null then raise exception 'Comparison not found'; end if;
 if not exists(select 1 from public.reports a join public.reports b on b.id=c.later_id where a.id=c.earlier_id and a.revision=c.earlier_revision and b.revision=c.later_revision) then return jsonb_build_object('status','stale','summary',null); end if;
 return jsonb_build_object('status',c.status,'summary',case when c.status='done' then c.summary else null end);
end $$;

create function public.claim_imaging_comparison() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.imaging_comparisons;
begin
 update public.imaging_comparisons set status='failed' where status='running' and leased_until<now() and attempts>=3;
 select * into c from public.imaging_comparisons where status='queued' or (status='running' and leased_until<now() and attempts<3) order by created_at for update skip locked limit 1;
 if c.id is null then return null; end if;
 update public.imaging_comparisons set status='running',lease_token=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'token',c.lease_token,'reports',c.source_reports);
end $$;

create function public.complete_imaging_comparison(comparison_id uuid,token uuid,result text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if result is not null and (length(trim(result))=0 or length(result)>2500) then raise exception 'Invalid comparison'; end if;
 update public.imaging_comparisons set status=case when result is null then 'failed' else 'done' end,summary=result,lease_token=null,leased_until=null
 where id=comparison_id and lease_token=token and status='running' and leased_until>now();
 if not found then raise exception 'Comparison lease expired'; end if;
end $$;
revoke all on function public.request_imaging_comparison(uuid,uuid),public.get_imaging_comparison(uuid),public.claim_imaging_comparison(),public.complete_imaging_comparison(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_imaging_comparison(uuid,uuid),public.get_imaging_comparison(uuid) to authenticated;
grant execute on function public.claim_imaging_comparison(),public.complete_imaging_comparison(uuid,uuid,text) to service_role;
