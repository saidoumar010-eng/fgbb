-- Autorise les rôles 'joueur' et 'club' dans profiles.role (contrainte CHECK).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['fan', 'joueur', 'club', 'table_technique', 'admin']));
