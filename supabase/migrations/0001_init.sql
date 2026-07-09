-- ============================================================
-- FGBB — Fédération Guinéenne de Basketball
-- Schéma initial : profils, compétitions, équipes, joueurs,
-- matchs, statistiques (box score), actualités + vues + RLS.
-- ============================================================

-- ---------- Helper : rôle admin (SECURITY DEFINER pour éviter la récursion RLS) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null default 'fan' check (role in ('fan', 'admin')),
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Crée automatiquement un profil 'fan' à chaque inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Compétitions ----------
create table if not exists public.competitions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null default 'championnat' check (type in ('championnat', 'coupe', 'tournoi')),
  category   text not null default 'messieurs' check (category in ('messieurs', 'dames', 'u18', 'autre')),
  season     text,
  format     text,
  created_at timestamptz not null default now()
);

-- ---------- Équipes / clubs ----------
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  short_name   text,                 -- ex: "SLA"
  city         text,
  division     text,                 -- ex: "Ligue 1 (H)"
  coach        text,
  founded_year int,
  color        text default '#1C3F8F',
  logo_url     text,
  is_national  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- Joueurs ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  team_id     uuid references public.teams (id) on delete set null,
  number      int,
  position    text,                  -- meneur, arrière, ailier, ailier fort, pivot
  height_cm   int,
  birth_date  date,
  nationality text default 'Guinéenne',
  photo_url   text,
  created_at  timestamptz not null default now()
);

-- ---------- Matchs ----------
create table if not exists public.matches (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid references public.competitions (id) on delete set null,
  home_team_id    uuid references public.teams (id) on delete cascade,
  away_team_id    uuid references public.teams (id) on delete cascade,
  scheduled_at    timestamptz,
  venue           text,
  status          text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  home_score      int default 0,
  away_score      int default 0,
  current_quarter int,
  -- ex: [{"q":1,"home":18,"away":15}, ...]
  quarter_scores  jsonb not null default '[]'::jsonb,
  video_url       text,              -- lien YouTube / Facebook
  created_at      timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create index if not exists matches_scheduled_idx on public.matches (scheduled_at);
create index if not exists matches_status_idx on public.matches (status);

-- ---------- Statistiques joueur par match (box score) ----------
create table if not exists public.player_match_stats (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete set null,
  minutes     int default 0,
  points      int default 0,
  rebounds    int default 0,
  assists     int default 0,
  steals      int default 0,
  blocks      int default 0,
  fouls       int default 0,
  fg_made     int default 0,
  fg_att      int default 0,
  three_made  int default 0,
  three_att   int default 0,
  ft_made     int default 0,
  ft_att      int default 0,
  created_at  timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ---------- Actualités ----------
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text default 'officiel',
  body         text,
  cover_url    text,
  author       text,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- VUES : classement & moyennes joueurs
-- ============================================================

-- Classement par équipe et compétition (victoire = 2 pts, défaite = 1 pt façon FIBA)
create or replace view public.team_standings as
with results as (
  select competition_id, home_team_id as team_id,
         case when home_score > away_score then 1 else 0 end as win,
         case when home_score < away_score then 1 else 0 end as loss
  from public.matches where status = 'finished'
  union all
  select competition_id, away_team_id as team_id,
         case when away_score > home_score then 1 else 0 end as win,
         case when away_score < home_score then 1 else 0 end as loss
  from public.matches where status = 'finished'
)
select
  r.competition_id,
  r.team_id,
  t.name      as team_name,
  t.short_name,
  t.color,
  count(*)              as played,
  sum(r.win)            as wins,
  sum(r.loss)           as losses,
  sum(r.win) * 2 + sum(r.loss) * 1 as points
from results r
join public.teams t on t.id = r.team_id
group by r.competition_id, r.team_id, t.name, t.short_name, t.color;

-- Moyennes saison par joueur
create or replace view public.player_season_stats as
select
  p.id   as player_id,
  p.full_name,
  p.team_id,
  count(s.id)                                   as games,
  round(avg(s.points)::numeric, 1)              as ppg,
  round(avg(s.rebounds)::numeric, 1)            as rpg,
  round(avg(s.assists)::numeric, 1)             as apg,
  round(avg(s.steals)::numeric, 1)              as spg,
  round(avg(s.blocks)::numeric, 1)              as bpg,
  case when sum(s.fg_att)   > 0 then round(100.0 * sum(s.fg_made)   / sum(s.fg_att), 0)   else 0 end as fg_pct,
  case when sum(s.three_att) > 0 then round(100.0 * sum(s.three_made) / sum(s.three_att), 0) else 0 end as three_pct
from public.players p
left join public.player_match_stats s on s.player_id = p.id
group by p.id, p.full_name, p.team_id;

-- ============================================================
-- RLS : lecture publique, écriture réservée aux admins
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.competitions       enable row level security;
alter table public.teams              enable row level security;
alter table public.players            enable row level security;
alter table public.matches            enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.news               enable row level security;

-- Profils : chacun voit/modifie le sien ; les admins voient tout
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- Lecture publique des données sportives
create policy "competitions_read"       on public.competitions       for select using (true);
create policy "teams_read"              on public.teams              for select using (true);
create policy "players_read"            on public.players            for select using (true);
create policy "matches_read"            on public.matches            for select using (true);
create policy "player_match_stats_read" on public.player_match_stats for select using (true);
create policy "news_read"               on public.news               for select using (true);

-- Écriture admin uniquement (INSERT / UPDATE / DELETE)
create policy "competitions_admin_write"       on public.competitions       for all using (public.is_admin()) with check (public.is_admin());
create policy "teams_admin_write"              on public.teams              for all using (public.is_admin()) with check (public.is_admin());
create policy "players_admin_write"            on public.players            for all using (public.is_admin()) with check (public.is_admin());
create policy "matches_admin_write"            on public.matches            for all using (public.is_admin()) with check (public.is_admin());
create policy "player_match_stats_admin_write" on public.player_match_stats for all using (public.is_admin()) with check (public.is_admin());
create policy "news_admin_write"               on public.news               for all using (public.is_admin()) with check (public.is_admin());
