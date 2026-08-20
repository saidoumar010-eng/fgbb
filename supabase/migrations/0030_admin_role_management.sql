-- Gestion des rôles depuis l'espace admin web.
-- Deux fonctions SECURITY DEFINER réservées aux admins (is_admin()).

-- Lister les comptes (email + rôle) — admins uniquement.
create or replace function public.admin_list_accounts()
returns table (id uuid, email text, full_name text, role text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, u.email::text, p.full_name, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by u.created_at;
$$;

-- Changer le rôle d'un compte — admins uniquement, rôles whitelistés.
create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if new_role not in ('fan', 'table_technique', 'admin') then
    raise exception 'Rôle invalide: %', new_role;
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

revoke all on function public.admin_list_accounts() from public;
revoke all on function public.admin_set_role(uuid, text) from public;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
