-- Phase E — Récompenses de saison (palmarès).
--
-- Distinctions éditoriales décernées par la fédération : joueur du mois, MVP de
-- la saison, meilleur cinq… Lecture publique, écriture réservée à l'admin.
create table if not exists public.awards (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('joueur_du_mois', 'mvp_saison', 'meilleur_cinq', 'autre')),
  season_id  uuid references public.seasons (id) on delete set null,
  player_id  uuid references public.players (id) on delete cascade,
  team_id    uuid references public.teams (id) on delete set null,
  label      text,          -- ex. « Janvier 2026 » ou intitulé libre
  note       text,
  awarded_at date,
  created_at timestamptz not null default now()
);
create index if not exists awards_kind_idx on public.awards (kind, awarded_at desc);

alter table public.awards enable row level security;

drop policy if exists "awards_read" on public.awards;
create policy "awards_read" on public.awards for select using (true);

drop policy if exists "awards_admin_write" on public.awards;
create policy "awards_admin_write" on public.awards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
