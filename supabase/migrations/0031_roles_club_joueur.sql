-- Élargit les types de compte gérables depuis l'admin web : ajout de 'club' et 'joueur'.
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
  if new_role not in ('fan', 'joueur', 'club', 'table_technique', 'admin') then
    raise exception 'Rôle invalide: %', new_role;
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;
