-- ============================================================
-- Statistiques avancées : balles perdues, +/-, carte des tirs,
-- bilan d'équipe sur la saison, records.
-- ============================================================

alter table public.player_match_stats add column if not exists turnovers    int not null default 0;
alter table public.player_match_stats add column if not exists plus_minus   int not null default 0;
alter table public.player_match_stats add column if not exists off_rebounds int not null default 0;

-- ---------------------------------------------------------------------------
-- Carte des tirs. Coordonnées normalisées 0–100 sur un demi-terrain :
-- x = largeur (0 = ligne de touche gauche), y = profondeur (0 = ligne de fond).
create table if not exists public.shots (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid references public.players (id) on delete set null,
  team_id    uuid references public.teams (id) on delete set null,
  x          numeric not null check (x >= 0 and x <= 100),
  y          numeric not null check (y >= 0 and y <= 100),
  points     int not null default 2 check (points in (1, 2, 3)),
  made       boolean not null default true,
  quarter    int,
  created_at timestamptz not null default now()
);
create index if not exists shots_match_idx  on public.shots (match_id);
create index if not exists shots_player_idx on public.shots (player_id);

alter table public.shots enable row level security;
drop policy if exists "shots_read" on public.shots;
drop policy if exists "shots_admin_write" on public.shots;
create policy "shots_read"        on public.shots for select using (true);
create policy "shots_admin_write" on public.shots for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bilan d'équipe sur la saison : attaque, défense, différentiel.
create or replace view public.team_season_stats
with (security_invoker = true) as
with r as (
  select competition_id, home_team_id as team_id, home_score as pf, away_score as pa
    from public.matches where status = 'finished'
  union all
  select competition_id, away_team_id as team_id, away_score as pf, home_score as pa
    from public.matches where status = 'finished'
)
select
  r.team_id,
  r.competition_id,
  t.name  as team_name,
  t.short_name,
  t.color,
  count(*)                                            as games,
  sum(case when r.pf > r.pa then 1 else 0 end)        as wins,
  sum(case when r.pf < r.pa then 1 else 0 end)        as losses,
  round(avg(r.pf)::numeric, 1)                        as pts_for,
  round(avg(r.pa)::numeric, 1)                        as pts_against,
  round((avg(r.pf) - avg(r.pa))::numeric, 1)          as diff,
  max(r.pf)                                           as best_score
from r
join public.teams t on t.id = r.team_id
group by r.team_id, r.competition_id, t.name, t.short_name, t.color;

-- ---------------------------------------------------------------------------
-- Meilleures performances individuelles sur un match (records de la saison).
create or replace view public.game_highs
with (security_invoker = true) as
select
  s.id,
  s.match_id,
  s.player_id,
  p.full_name,
  p.photo_url,
  p.team_id,
  t.short_name as team_short,
  t.color      as team_color,
  m.scheduled_at,
  s.points, s.rebounds, s.assists, s.steals, s.blocks, s.three_made
from public.player_match_stats s
join public.players p on p.id = s.player_id
left join public.teams t on t.id = s.team_id
join public.matches m on m.id = s.match_id
where m.status = 'finished';

-- ---------------------------------------------------------------------------
-- Statistiques cumulées d'un joueur sur une compétition (graphiques
-- d'évolution match par match).
drop function if exists public.player_progression(uuid, int);
create function public.player_progression(p_player_id uuid, p_limit int default 15)
returns table (
  match_id     uuid,
  scheduled_at timestamptz,
  opponent     text,
  points       int,
  rebounds     int,
  assists      int
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.scheduled_at,
         case when s.team_id = m.home_team_id then ta.short_name else th.short_name end,
         s.points, s.rebounds, s.assists
    from public.player_match_stats s
    join public.matches m on m.id = s.match_id and m.status = 'finished'
    left join public.teams th on th.id = m.home_team_id
    left join public.teams ta on ta.id = m.away_team_id
   where s.player_id = p_player_id
   order by m.scheduled_at desc nulls last
   limit greatest(1, least(coalesce(p_limit, 15), 60));
$$;
