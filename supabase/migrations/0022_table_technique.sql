-- Phase C — Jour de match & table technique.
--
-- Introduit un rôle restreint « table technique » (au-delà de fan/admin), la
-- feuille de match numérique (chaque équipe valide ses 12), et étend au rôle
-- les droits du jour de match : désignation des arbitres, programmation et
-- gestion des matchs, saisie du box score. Rien de tout cela n'ouvre l'accès
-- admin complet (licences, transferts, comptes, contenus restent à la fédération).

-- ---------------------------------------------------------------------------
-- 1) Nouveau rôle. On remplace la contrainte CHECK quel que soit son nom.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%role%';
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;
alter table public.profiles
  add constraint profiles_role_check check (role in ('fan', 'admin', 'table_technique'));

-- Officiel de table = admin OU table technique. Sert de garde aux policies du
-- jour de match. security definer + search_path figé, comme is_admin().
create or replace function public.is_table_official()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'table_technique')
  );
$$;
revoke execute on function public.is_table_official() from public, anon;
grant execute on function public.is_table_official() to authenticated;

-- Attribution du rôle par la fédération. Bornée à fan/table_technique : on ne
-- fabrique jamais un admin par ce biais (la promotion admin reste manuelle).
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à la fédération.';
  end if;
  if p_role not in ('fan', 'table_technique') then
    raise exception 'Rôle non autorisé.';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Droits du jour de match étendus à l'officiel de table (inclut l'admin).
drop policy if exists "matches_admin_write" on public.matches;
create policy "matches_write" on public.matches
  for all to authenticated
  using (public.is_table_official()) with check (public.is_table_official());

drop policy if exists "player_match_stats_admin_write" on public.player_match_stats;
create policy "player_match_stats_write" on public.player_match_stats
  for all to authenticated
  using (public.is_table_official()) with check (public.is_table_official());

drop policy if exists "match_officials_admin_write" on public.match_officials;
create policy "match_officials_write" on public.match_officials
  for all to authenticated
  using (public.is_table_official()) with check (public.is_table_official());

-- ---------------------------------------------------------------------------
-- 3) Feuille de match numérique : les joueurs retenus par chaque équipe.
create table if not exists public.match_lineups (
  match_id   uuid not null references public.matches (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_lineups_match_idx on public.match_lineups (match_id);

alter table public.match_lineups enable row level security;

drop policy if exists "match_lineups_read" on public.match_lineups;
create policy "match_lineups_read" on public.match_lineups for select using (true);

-- Un club compose SON équipe (manages_team) ; l'officiel de table peut tout
-- ajuster à la table de marque.
drop policy if exists "match_lineups_write" on public.match_lineups;
create policy "match_lineups_write" on public.match_lineups
  for all to authenticated
  using (public.manages_team(team_id) or public.is_table_official())
  with check (public.manages_team(team_id) or public.is_table_official());

-- Validation par équipe : le club verrouille ses 12, la table technique clôt.
create table if not exists public.match_lineup_status (
  match_id     uuid not null references public.matches (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  validated    boolean not null default false,
  validated_at timestamptz,
  primary key (match_id, team_id)
);

alter table public.match_lineup_status enable row level security;

drop policy if exists "match_lineup_status_read" on public.match_lineup_status;
create policy "match_lineup_status_read" on public.match_lineup_status for select using (true);

drop policy if exists "match_lineup_status_write" on public.match_lineup_status;
create policy "match_lineup_status_write" on public.match_lineup_status
  for all to authenticated
  using (public.manages_team(team_id) or public.is_table_official())
  with check (public.manages_team(team_id) or public.is_table_official());
