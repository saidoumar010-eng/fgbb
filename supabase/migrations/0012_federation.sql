-- ============================================================
-- Outils de gestion de la fédération :
-- saisons, licences, arbitres & désignations, discipline,
-- transferts, inscriptions de clubs, journées / poules.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Saisons sportives (2025-2026, ...). Une seule saison « en cours » à la fois.
create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_date date,
  end_date   date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists seasons_one_current_idx
  on public.seasons ((is_current)) where is_current;

alter table public.seasons enable row level security;
drop policy if exists "seasons_read" on public.seasons;
drop policy if exists "seasons_admin_write" on public.seasons;
create policy "seasons_read"        on public.seasons for select using (true);
create policy "seasons_admin_write" on public.seasons for all using (public.is_admin()) with check (public.is_admin());

-- Rattachement des compétitions et des matchs à une saison + journée / poule.
alter table public.competitions add column if not exists season_id uuid references public.seasons (id) on delete set null;
alter table public.matches      add column if not exists season_id uuid references public.seasons (id) on delete set null;
alter table public.matches      add column if not exists round int;         -- journée
alter table public.matches      add column if not exists group_name text;   -- poule A, poule B...

-- ---------------------------------------------------------------------------
-- Licences des joueurs. Données administratives : lecture ADMIN uniquement
-- (numéro de licence, document justificatif).
create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players (id) on delete cascade,
  season_id    uuid references public.seasons (id) on delete set null,
  team_id      uuid references public.teams (id) on delete set null,
  number       text,
  status       text not null default 'pending'
               check (status in ('pending', 'valid', 'suspended', 'expired')),
  issued_at    date,
  expires_at   date,
  document_url text,
  note         text,
  created_at   timestamptz not null default now(),
  unique (player_id, season_id)
);
create index if not exists licenses_player_idx on public.licenses (player_id);
create index if not exists licenses_status_idx on public.licenses (status);

alter table public.licenses enable row level security;
drop policy if exists "licenses_admin_all" on public.licenses;
create policy "licenses_admin_all" on public.licenses for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Arbitres. Les informations sportives sont publiques (elles apparaissent sur
-- la feuille de match) ; les coordonnées personnelles vivent dans une table
-- séparée réservée aux administrateurs.
create table if not exists public.referees (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  city           text,
  level          text not null default 'regional'
                 check (level in ('regional', 'national', 'fiba')),
  license_number text,
  photo_url      text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.referees enable row level security;
drop policy if exists "referees_read" on public.referees;
drop policy if exists "referees_admin_write" on public.referees;
create policy "referees_read"        on public.referees for select using (true);
create policy "referees_admin_write" on public.referees for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.referee_contacts (
  referee_id uuid primary key references public.referees (id) on delete cascade,
  phone      text,
  email      text,
  address    text
);

alter table public.referee_contacts enable row level security;
drop policy if exists "referee_contacts_admin_all" on public.referee_contacts;
create policy "referee_contacts_admin_all" on public.referee_contacts for all using (public.is_admin()) with check (public.is_admin());

-- Désignations : quels arbitres officient sur quel match.
create table if not exists public.match_officials (
  match_id   uuid not null references public.matches (id) on delete cascade,
  referee_id uuid not null references public.referees (id) on delete cascade,
  role       text not null default 'principal'
             check (role in ('principal', 'assistant', 'table', 'commissaire')),
  created_at timestamptz not null default now(),
  primary key (match_id, referee_id)
);
create index if not exists match_officials_match_idx on public.match_officials (match_id);

alter table public.match_officials enable row level security;
drop policy if exists "match_officials_read" on public.match_officials;
drop policy if exists "match_officials_admin_write" on public.match_officials;
create policy "match_officials_read"        on public.match_officials for select using (true);
create policy "match_officials_admin_write" on public.match_officials for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Discipline : avertissements, suspensions, amendes (publiées par la fédération).
create table if not exists public.sanctions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid references public.players (id) on delete cascade,
  team_id    uuid references public.teams (id) on delete cascade,
  match_id   uuid references public.matches (id) on delete set null,
  kind       text not null default 'avertissement'
             check (kind in ('avertissement', 'suspension', 'amende', 'exclusion')),
  games      int not null default 0,          -- nombre de matchs de suspension
  amount_gnf bigint not null default 0,       -- montant de l'amende en GNF
  reason     text,
  decided_at date not null default current_date,
  status     text not null default 'active'
             check (status in ('active', 'served', 'cancelled')),
  created_at timestamptz not null default now(),
  check (player_id is not null or team_id is not null)
);
create index if not exists sanctions_player_idx on public.sanctions (player_id);
create index if not exists sanctions_team_idx   on public.sanctions (team_id);

alter table public.sanctions enable row level security;
drop policy if exists "sanctions_read" on public.sanctions;
drop policy if exists "sanctions_admin_write" on public.sanctions;
create policy "sanctions_read"        on public.sanctions for select using (true);
create policy "sanctions_admin_write" on public.sanctions for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Transferts / mutations. À l'approbation, le joueur change officiellement
-- de club (le trigger met à jour players.team_id).
create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players (id) on delete cascade,
  from_team_id uuid references public.teams (id) on delete set null,
  to_team_id   uuid references public.teams (id) on delete set null,
  season_id    uuid references public.seasons (id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  note         text,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists transfers_player_idx on public.transfers (player_id);
create index if not exists transfers_status_idx on public.transfers (status);

alter table public.transfers enable row level security;
drop policy if exists "transfers_read" on public.transfers;
drop policy if exists "transfers_admin_write" on public.transfers;
create policy "transfers_read"        on public.transfers for select using (true);
create policy "transfers_admin_write" on public.transfers for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.apply_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.to_team_id is not null then
      update public.players set team_id = new.to_team_id where id = new.player_id;
    end if;
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists apply_transfer on public.transfers;
create trigger apply_transfer
  before insert or update on public.transfers
  for each row execute function public.apply_transfer();

-- ---------------------------------------------------------------------------
-- Inscriptions des clubs à une compétition. Un dirigeant connecté dépose sa
-- demande ; la fédération l'approuve (et crée l'équipe si besoin).
create table if not exists public.club_registrations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  club_name      text not null,
  city           text,
  category       text not null default 'messieurs'
                 check (category in ('messieurs', 'dames', 'u18', 'autre')),
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  competition_id uuid references public.competitions (id) on delete set null,
  season_id      uuid references public.seasons (id) on delete set null,
  logo_url       text,
  note           text,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  team_id        uuid references public.teams (id) on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
create index if not exists club_registrations_status_idx on public.club_registrations (status);

alter table public.club_registrations enable row level security;
drop policy if exists "club_registrations_select_own_or_admin" on public.club_registrations;
drop policy if exists "club_registrations_insert_own" on public.club_registrations;
drop policy if exists "club_registrations_admin_write" on public.club_registrations;
create policy "club_registrations_select_own_or_admin" on public.club_registrations
  for select using (user_id = auth.uid() or public.is_admin());
create policy "club_registrations_insert_own" on public.club_registrations
  for insert with check (user_id = auth.uid());
create policy "club_registrations_admin_write" on public.club_registrations
  for all using (public.is_admin()) with check (public.is_admin());

-- Empêche un demandeur de s'auto-approuver : seul un admin peut changer le statut.
create or replace function public.guard_registration_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' and not public.is_admin() then
      new.status := 'pending';
    end if;
    new.team_id := case when public.is_admin() then new.team_id else null end;
  elsif old.status is distinct from new.status and not public.is_admin() then
    raise exception 'Seule la fédération peut modifier le statut d''une inscription';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_registration_status on public.club_registrations;
create trigger guard_registration_status
  before insert or update on public.club_registrations
  for each row execute function public.guard_registration_status();

revoke execute on function public.apply_transfer() from anon, authenticated;
revoke execute on function public.guard_registration_status() from anon, authenticated;
