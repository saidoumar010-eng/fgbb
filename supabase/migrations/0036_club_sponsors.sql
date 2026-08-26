-- Sponsors du club : chaque club affiche ses propres partenaires sur sa page.
create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  logo_url text,
  url text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists club_sponsors_team_idx on public.club_sponsors(team_id);
alter table public.club_sponsors enable row level security;

-- Lecture publique (les sponsors s'affichent sur la fiche publique du club).
drop policy if exists club_sponsors_public_read on public.club_sponsors;
create policy club_sponsors_public_read on public.club_sponsors for select to public using (true);

-- Le dirigeant gère les sponsors de SON équipe.
drop policy if exists club_sponsors_club_write on public.club_sponsors;
create policy club_sponsors_club_write on public.club_sponsors for all to authenticated
  using (public.manages_team(team_id)) with check (public.manages_team(team_id));

-- La fédération (admin) garde la main sur tout.
drop policy if exists club_sponsors_admin on public.club_sponsors;
create policy club_sponsors_admin on public.club_sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
