create table public.doctor_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  payload jsonb not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index doctor_access_owner_idx on public.doctor_access_grants(owner_id,expires_at);
alter table public.doctor_access_grants enable row level security;
revoke all on public.doctor_access_grants from public,anon,authenticated;
grant all on public.doctor_access_grants to service_role;

create function public.create_doctor_access(records jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); secret uuid:=gen_random_uuid(); expiry timestamptz:=now()+interval '15 minutes';
begin
  delete from public.doctor_access_grants where expires_at<=now();
  if jsonb_typeof(records->'documents') is distinct from 'array' or
    jsonb_typeof(records->'reports') is distinct from 'array' or
    jsonb_array_length(records->'documents')>100 or length(records::text)>1000000
  then raise exception 'Invalid record bundle'; end if;
  delete from public.doctor_access_grants where owner_id=u and redeemed_at is null;
  insert into public.doctor_access_grants(owner_id,token_hash,payload,expires_at)
  values(u,md5(secret::text),records || jsonb_build_object('expiresAt',expiry),expiry);
  return jsonb_build_object('token',secret,'expiresAt',expiry);
end $$;
revoke all on function public.create_doctor_access(jsonb) from public,anon;
grant execute on function public.create_doctor_access(jsonb) to authenticated;

create function public.redeem_doctor_access(secret text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bundle jsonb; grant_id uuid;
begin
  if secret !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select id,payload into grant_id,bundle from public.doctor_access_grants
  where token_hash=md5(secret) and redeemed_at is null and expires_at>now() for update;
  if grant_id is null then return null; end if;
  update public.doctor_access_grants set redeemed_at=now(),payload='{}'::jsonb where id=grant_id;
  return bundle;
end $$;
revoke all on function public.redeem_doctor_access(text) from public;
grant execute on function public.redeem_doctor_access(text) to anon,authenticated;

create function public.doctor_access_status() returns jsonb
language sql security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('expiresAt',expires_at,'redeemedAt',redeemed_at)
    from public.doctor_access_grants where owner_id=public.require_mfa() and expires_at>now()
    order by created_at desc limit 1),'null'::jsonb)
$$;
revoke all on function public.doctor_access_status() from public,anon;
grant execute on function public.doctor_access_status() to authenticated;

create function public.revoke_doctor_access() returns void
language sql security definer set search_path='' as $$
  delete from public.doctor_access_grants where owner_id=public.require_mfa()
$$;
revoke all on function public.revoke_doctor_access() from public,anon;
grant execute on function public.revoke_doctor_access() to authenticated;
