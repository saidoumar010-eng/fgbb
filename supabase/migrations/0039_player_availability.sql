-- Vague 3 « Outils du quotidien » — Convocations & disponibilités.
-- Le staff renseigne, pour un match à venir, la disponibilité de chaque joueur
-- (disponible / incertain / blessé / absent). Sert de base à la feuille de match.
-- Lecture + écriture réservées au responsable du club (manages_team).
create table if not exists public.player_availability (
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'available' check (status in ('available','doubtful','injured','absent')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists player_availability_match_team_idx on public.player_availability(match_id, team_id);

alter table public.player_availability enable row level security;

drop policy if exists pa_select on public.player_availability;
create policy pa_select on public.player_availability
  for select to authenticated using (public.manages_team(team_id));

drop policy if exists pa_write on public.player_availability;
create policy pa_write on public.player_availability
  for all to authenticated using (public.manages_team(team_id)) with check (public.manages_team(team_id));
