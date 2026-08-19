-- Phase J — Poules, playoffs et réseaux sociaux.
--
-- 1. competition_teams : la fédération affecte explicitement chaque équipe à une
--    poule d'une compétition. Le classement par poule s'appuie dessus.
-- 2. matches.phase / playoff_round : saison régulière vs playoffs (tableau final
--    des 4 premiers de chaque poule).
-- 3. liens réseaux sociaux sur les clubs et les joueurs (la fédération gère déjà
--    ses propres liens dans settings.federation).
-- 4. vue poule_standings : classement complet par poule (Pts, MJ, V, D, Pts+,
--    Pts-, Diff) en n'agrégeant que les matchs de saison régulière terminés.
--
-- Migration purement additive : aucune donnée ni structure existante n'est
-- supprimée ou modifiée de façon incompatible.

-- ---------------------------------------------------------------------------
-- 1. Affectation des équipes aux poules
create table if not exists public.competition_teams (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade,
  poule          text,                          -- ex: "A", "B" (null = sans poule)
  seed           int,                           -- ordre d'affichage / tête de série
  created_at     timestamptz not null default now(),
  primary key (competition_id, team_id)
);
create index if not exists idx_competition_teams_comp on public.competition_teams (competition_id);

alter table public.competition_teams enable row level security;
drop policy if exists "competition_teams_read" on public.competition_teams;
create policy "competition_teams_read" on public.competition_teams
  for select using (true);
drop policy if exists "competition_teams_admin_write" on public.competition_teams;
create policy "competition_teams_admin_write" on public.competition_teams
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Playoffs : phase du match + tour du tableau final
alter table public.matches
  add column if not exists phase text not null default 'regular'
    check (phase in ('regular', 'playoff'));
alter table public.matches
  add column if not exists playoff_round text;   -- quart, demi, finale, petite_finale…

-- ---------------------------------------------------------------------------
-- 3. Réseaux sociaux
alter table public.teams   add column if not exists facebook  text;
alter table public.teams   add column if not exists instagram text;
alter table public.teams   add column if not exists tiktok    text;
alter table public.teams   add column if not exists youtube   text;
alter table public.teams   add column if not exists x_url     text;   -- ex-Twitter
alter table public.teams   add column if not exists website   text;

alter table public.players add column if not exists instagram text;
alter table public.players add column if not exists tiktok    text;
alter table public.players add column if not exists x_url     text;

-- ---------------------------------------------------------------------------
-- 4. Classement par poule (complet, façon affiche D1)
create or replace view public.poule_standings as
with results as (
  select competition_id,
         home_team_id as team_id,
         home_score   as pf,
         away_score   as pa,
         case when home_score > away_score then 1 else 0 end as win,
         case when home_score < away_score then 1 else 0 end as loss
  from public.matches
  where status = 'finished' and coalesce(phase, 'regular') = 'regular'
  union all
  select competition_id,
         away_team_id as team_id,
         away_score   as pf,
         home_score   as pa,
         case when away_score > home_score then 1 else 0 end as win,
         case when away_score < home_score then 1 else 0 end as loss
  from public.matches
  where status = 'finished' and coalesce(phase, 'regular') = 'regular'
)
select
  ct.competition_id,
  ct.poule,
  ct.team_id,
  ct.seed,
  t.name       as team_name,
  t.short_name,
  t.color,
  count(r.team_id)                                   as played,
  coalesce(sum(r.win), 0)                            as wins,
  coalesce(sum(r.loss), 0)                           as losses,
  coalesce(sum(r.win) * 2 + sum(r.loss) * 1, 0)      as points,
  coalesce(sum(r.pf), 0)                             as pts_for,
  coalesce(sum(r.pa), 0)                             as pts_against,
  coalesce(sum(r.pf) - sum(r.pa), 0)                 as diff
from public.competition_teams ct
join public.teams t on t.id = ct.team_id
left join results r on r.team_id = ct.team_id and r.competition_id = ct.competition_id
group by ct.competition_id, ct.poule, ct.team_id, ct.seed, t.name, t.short_name, t.color;

-- La vue s'exécute avec les droits de l'appelant (RLS des tables sous-jacentes,
-- toutes en lecture publique) — cohérent avec team_standings.
alter view public.poule_standings set (security_invoker = on);
