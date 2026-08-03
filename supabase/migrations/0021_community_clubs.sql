-- Phase B — Communauté des clubs.
--
-- 1) Publications des clubs (fil d'actu), 2) abonnements à un joueur,
-- 3) compteurs d'audience côté club. Le fil est public en lecture ; l'écriture
-- d'une publication reste bornée au club concerné (manages_team) ou à l'admin.

-- ---------------------------------------------------------------------------
-- 1) Publications des clubs.
create table if not exists public.club_posts (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,
  body       text not null,
  image_url  text,
  created_at timestamptz not null default now()
);
create index if not exists club_posts_team_idx on public.club_posts (team_id, created_at desc);

alter table public.club_posts enable row level security;

-- Lecture publique : `using (true)` n'appelle aucune fonction, donc anon ne
-- risque pas l'échec de requête entière des migrations 0009/0017.
drop policy if exists "club_posts_read" on public.club_posts;
create policy "club_posts_read" on public.club_posts for select using (true);

-- Le dirigeant gère les publications de SON club ; l'admin, toutes.
drop policy if exists "club_posts_write" on public.club_posts;
create policy "club_posts_write" on public.club_posts
  for all to authenticated
  using (public.manages_team(team_id) or public.is_admin())
  with check (public.manages_team(team_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Abonnements à un joueur (miroir de public.favorites pour les équipes).
create table if not exists public.player_follows (
  user_id    uuid not null references auth.users (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
create index if not exists player_follows_player_idx on public.player_follows (player_id);

alter table public.player_follows enable row level security;

create policy "player_follows_select_own" on public.player_follows
  for select to authenticated using (user_id = auth.uid());
create policy "player_follows_insert_own" on public.player_follows
  for insert to authenticated with check (user_id = auth.uid());
create policy "player_follows_delete_own" on public.player_follows
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Compteurs d'audience.
--
-- favorites et player_follows n'exposent que les lignes de l'utilisateur
-- courant (vie privée des supporters). Pour donner un nombre d'abonnés sans
-- révéler QUI suit, on passe par des fonctions security definer.

-- Abonnés d'un club : réservé au dirigeant du club et à l'admin.
create or replace function public.club_follower_count(p_team_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.manages_team(p_team_id) or public.is_admin()) then
    raise exception 'Accès réservé au club.';
  end if;
  return (select count(*) from public.favorites where team_id = p_team_id);
end;
$$;
revoke execute on function public.club_follower_count(uuid) from public, anon;
grant execute on function public.club_follower_count(uuid) to authenticated;

-- Abonnés d'un joueur : un simple total, information publique (comme un réseau).
create or replace function public.player_follower_count(p_player_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.player_follows where player_id = p_player_id;
$$;
revoke execute on function public.player_follower_count(uuid) from public;
grant execute on function public.player_follower_count(uuid) to anon, authenticated;
