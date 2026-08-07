-- Recherche de comptes par nom ou e-mail, réservée à la fédération.
--
-- Jusqu'ici, accorder le rôle « table technique » ou une délégation de club
-- obligeait l'admin à copier l'UUID d'un compte depuis le tableau de bord
-- Supabase (Authentication > Users) : la table `auth.users` n'est pas exposée au
-- client, et `profiles` ne porte pas l'e-mail. Cette fonction lève cette
-- dépendance en cherchant dans `auth.users` — mais UNIQUEMENT pour un admin.
--
-- security definer + search_path figé (comme is_admin()) pour lire `auth`, et le
-- garde `is_admin()` dans le WHERE : un non-admin obtient zéro ligne, jamais la
-- liste des e-mails. On exige au moins deux caractères pour ne pas déverser tout
-- l'annuaire, et on borne à 20 résultats.
create or replace function public.search_accounts(p_query text)
returns table (id uuid, full_name text, email text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name, u.email::text, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
    and char_length(btrim(coalesce(p_query, ''))) >= 2
    and (
      p.full_name ilike '%' || btrim(p_query) || '%'
      or u.email ilike '%' || btrim(p_query) || '%'
    )
  order by p.full_name nulls last, u.email
  limit 20;
$$;

revoke execute on function public.search_accounts(text) from public, anon;
grant execute on function public.search_accounts(text) to authenticated;
