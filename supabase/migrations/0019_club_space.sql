-- Espace club délégué.
--
-- Un dirigeant de club tient son effectif lui-même, sans pouvoir toucher à ce
-- qui engage la compétition. La fédération reste seule à créer les matchs, à
-- saisir les scores, à délivrer les licences et à décider des transferts.
--
-- Le rattachement passe par une table de liaison plutôt que par un rôle global
-- sur le profil : un dirigeant est délégué D'UN club précis, et la fédération
-- seule accorde ou retire ce rattachement.

create table if not exists public.club_members (
  user_id    uuid not null references auth.users (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create index if not exists club_members_team_idx on public.club_members (team_id);

alter table public.club_members enable row level security;

-- Chacun voit son propre rattachement ; la fédération voit et modifie tout.
-- `to authenticated` partout : anon ne peut pas exécuter is_admin(), et une
-- policy qui l'appelle ferait échouer la requête ENTIÈRE, pas seulement la
-- ligne (leçon des migrations 0009 et 0017).
create policy "club_members_read_own"   on public.club_members
  for select to authenticated using (user_id = auth.uid());
create policy "club_members_admin_read" on public.club_members
  for select to authenticated using (public.is_admin());
create policy "club_members_admin_write" on public.club_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Le club que dirige l'utilisateur courant.
--
-- security definer pour lire club_members sans dépendre des policies de
-- lecture, et search_path figé pour qu'aucun schéma détourné ne s'interpose.
create or replace function public.manages_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.club_members
    where user_id = auth.uid() and team_id = p_team_id
  );
$$;

revoke execute on function public.manages_team(uuid) from public, anon;
grant execute on function public.manages_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Effectif : le dirigeant gère les joueurs de SON club.
--
-- `using` borne les lignes qu'il peut atteindre, `with check` la ligne qui en
-- résulte : les deux sont nécessaires, sans le second un dirigeant pourrait
-- faire passer un joueur adverse dans son équipe — ou l'inverse. Un changement
-- de club reste un transfert, décidé par la fédération.
create policy "players_club_manage" on public.players
  for all to authenticated
  using (team_id is not null and public.manages_team(team_id))
  with check (team_id is not null and public.manages_team(team_id));

-- ---------------------------------------------------------------------------
-- Fiche du club : seuls quelques champs de présentation sont délégués.
--
-- Passer par une fonction plutôt que par une policy d'UPDATE : les policies
-- RLS ne savent pas restreindre les COLONNES. Sans cela un dirigeant pourrait
-- renommer son club, le déclarer équipe nationale ou changer sa division —
-- toutes choses qui engagent la compétition.
create or replace function public.update_my_club(
  p_team_id  uuid,
  p_coach    text,
  p_city     text,
  p_color    text,
  p_logo_url text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.manages_team(p_team_id) then
    raise exception 'Vous ne dirigez pas ce club.';
  end if;
  update public.teams
     set coach    = p_coach,
         city     = p_city,
         color    = p_color,
         logo_url = p_logo_url
   where id = p_team_id;
end;
$$;

revoke execute on function public.update_my_club(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_my_club(uuid, text, text, text, text) to authenticated;
