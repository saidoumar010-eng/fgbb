-- Notifications push : jeton par appareil + garde-fou de rôle.

alter table public.profiles add column if not exists push_token text;

-- Empêche un utilisateur de changer son propre rôle (ex : se promouvoir admin).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end $$;

revoke execute on function public.guard_profile_role() from public, anon, authenticated;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();
