create table public.user_profiles (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '' check(length(first_name)<=100),
 last_name text not null default '' check(length(last_name)<=100),
 birth_date date,
 photo_path text,
 weight_kg numeric check(weight_kg>0 and weight_kg<=1000),
 height_meters numeric check(height_meters>0 and height_meters<=3)
);
alter table public.user_profiles enable row level security;
create policy profile_owner on public.user_profiles for select to authenticated using(owner_id=public.require_mfa());
grant select on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

create function public.get_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); result jsonb;
begin
 select jsonb_build_object('firstName',first_name,'lastName',last_name,'birthDate',coalesce(birth_date::text,''),'photoPath',photo_path,'weightKg',weight_kg,'heightMeters',height_meters) into result from public.user_profiles where owner_id=u;
 return result;
end $$;
create function public.save_profile(item jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); birthday date:=nullif(item->>'birthDate','')::date; photo text:=nullif(item->>'photoPath','');
begin
 if birthday>current_date or (birthday is not null and birthday::text<>item->>'birthDate') then raise exception 'Invalid birth date'; end if;
 if photo is not null and (photo !~ ('^'||u::text||'/[0-9a-f-]+\.(jpg|png)$') or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=photo)) then raise exception 'Invalid profile photo'; end if;
 insert into public.user_profiles(owner_id,first_name,last_name,birth_date,photo_path,weight_kg,height_meters)
 values(u,coalesce(trim(item->>'firstName'),''),coalesce(trim(item->>'lastName'),''),birthday,photo,(item->>'weightKg')::numeric,(item->>'heightMeters')::numeric)
 on conflict(owner_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,birth_date=excluded.birth_date,photo_path=excluded.photo_path,weight_kg=excluded.weight_kg,height_meters=excluded.height_meters;
end $$;
revoke all on function public.get_profile(),public.save_profile(jsonb) from public,anon,authenticated;
grant execute on function public.get_profile(),public.save_profile(jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('profile-photos','profile-photos',false,5242880,array['image/jpeg','image/png']);
create policy profile_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and split_part(name,'/',1)=public.require_mfa()::text);
create policy profile_photo_upload on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and split_part(name,'/',1)=public.require_mfa()::text and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png)$');
create policy profile_photo_delete on storage.objects for delete to authenticated using(bucket_id='profile-photos' and split_part(name,'/',1)=public.require_mfa()::text);
