alter table public.user_profiles
 add column weight_unit text not null default 'kg' check(weight_unit in ('kg','lb')),
 add column height_unit text not null default 'm' check(height_unit in ('m','in')),
 add column goals text[] not null default '{}' check(goals <@ array['digitize','compare','appointments','understand']::text[]),
 add column onboarding_completed boolean not null default false;

alter function public.get_profile() rename to get_profile_before_onboarding;
alter function public.save_profile(jsonb) rename to save_profile_before_onboarding;
revoke all on function public.get_profile_before_onboarding(),public.save_profile_before_onboarding(jsonb) from public,anon,authenticated;

create function public.get_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); result jsonb;
begin
 select public.get_profile_before_onboarding() || jsonb_build_object(
  'weightUnit',weight_unit,'heightUnit',height_unit,'goals',to_jsonb(goals),'onboardingCompleted',onboarding_completed,
  'aiHelp',(select show_ai_interpretation from public.user_preferences where owner_id=u))
 into result from public.user_profiles where owner_id=u;
 return result;
end $$;

create function public.save_profile(item jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_mfa(); completed boolean:=coalesce((item->>'onboardingCompleted')::boolean,false); selected_goals text[];
begin
 if jsonb_typeof(coalesce(item->'goals','[]'::jsonb))<>'array' then raise exception 'Invalid goals'; end if;
 select coalesce(array_agg(distinct value),'{}') into selected_goals from jsonb_array_elements_text(coalesce(item->'goals','[]'::jsonb));
 completed:=completed or coalesce((select onboarding_completed from public.user_profiles where owner_id=u),false);
 if completed and (coalesce(trim(item->>'firstName'),'')='' or coalesce(trim(item->>'lastName'),'')='' or nullif(item->>'birthDate','') is null or item->>'weightKg' is null or cardinality(selected_goals)=0 or coalesce(jsonb_typeof(item->'aiHelp'),'null')<>'boolean') then
  raise exception 'Complete your name, birth date, weight, goals and AI preference';
 end if;
 perform public.save_profile_before_onboarding(item);
 update public.user_profiles set weight_unit=coalesce(item->>'weightUnit','kg'),height_unit=coalesce(item->>'heightUnit','m'),goals=selected_goals,onboarding_completed=completed where owner_id=u;
 if item->>'aiHelp' is not null then perform public.set_ai_interpretation_preference((item->>'aiHelp')::boolean); end if;
end $$;
revoke all on function public.get_profile(),public.save_profile(jsonb) from public,anon,authenticated;
grant execute on function public.get_profile(),public.save_profile(jsonb) to authenticated;
