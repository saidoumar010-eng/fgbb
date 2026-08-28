-- Vague 3 « Outils du quotidien » — Événements du club + RSVP (feature 11).
-- Le club annonce des événements (match à domicile, portes ouvertes, détection…)
-- et les fans s'inscrivent gratuitement. Billetterie payante exclue.

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'other' check (kind in ('home_game','open_house','tryout','other')),
  starts_at timestamptz not null,
  location text,
  cover_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists club_events_team_time_idx on public.club_events(team_id, starts_at);

create table if not exists public.club_event_rsvp (
  event_id uuid not null references public.club_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists club_event_rsvp_event_idx on public.club_event_rsvp(event_id);

alter table public.club_events enable row level security;
alter table public.club_event_rsvp enable row level security;

-- événements : lecture publique, écriture réservée au club (ou admin fédération)
drop policy if exists ce_read on public.club_events;
create policy ce_read on public.club_events for select using (true);
drop policy if exists ce_write on public.club_events;
create policy ce_write on public.club_events for all to authenticated
  using (public.manages_team(team_id) or public.is_admin())
  with check (public.manages_team(team_id) or public.is_admin());

-- inscriptions : chaque fan ne gère et ne voit QUE ses propres inscriptions.
-- (Les décomptes publics passent par club_event_counts, SECURITY DEFINER.)
drop policy if exists cer_select_own on public.club_event_rsvp;
create policy cer_select_own on public.club_event_rsvp for select to authenticated using (user_id = auth.uid());
drop policy if exists cer_insert_own on public.club_event_rsvp;
create policy cer_insert_own on public.club_event_rsvp for insert to authenticated with check (user_id = auth.uid());
drop policy if exists cer_update_own on public.club_event_rsvp;
create policy cer_update_own on public.club_event_rsvp for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cer_delete_own on public.club_event_rsvp;
create policy cer_delete_own on public.club_event_rsvp for delete to authenticated using (user_id = auth.uid());

-- décomptes d'inscrits par événement (agrégat only → sans exposer les identités)
create or replace function public.club_event_counts(p_team_id uuid)
returns table(event_id uuid, going bigint, maybe bigint)
language sql security definer set search_path to 'public', 'pg_temp' stable as $$
  select r.event_id,
         count(*) filter (where r.status = 'going') as going,
         count(*) filter (where r.status = 'maybe') as maybe
  from public.club_event_rsvp r
  join public.club_events e on e.id = r.event_id
  where e.team_id = p_team_id
  group by r.event_id;
$$;
revoke execute on function public.club_event_counts(uuid) from public;
grant execute on function public.club_event_counts(uuid) to anon, authenticated;
