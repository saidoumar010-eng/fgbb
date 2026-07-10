-- Fil de match en direct (play-by-play) + fan zone (vote MVP, sondages, pronostics).

-- ---------------------------------------------------------------------------
-- Événements de match : chaque panier / correction / changement de quart-temps
-- saisi par la fédération apparaît en temps réel chez les supporters.
create table if not exists public.match_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  team_id    uuid references public.teams (id) on delete set null,
  player_id  uuid references public.players (id) on delete set null,
  kind       text not null default 'points' check (kind in ('points', 'correction', 'quarter', 'info')),
  points     int  not null default 0,
  quarter    int,
  label      text,
  created_at timestamptz not null default now()
);
create index if not exists match_events_match_idx on public.match_events (match_id, created_at desc);

alter table public.match_events enable row level security;
create policy "match_events_read"        on public.match_events for select using (true);
create policy "match_events_admin_write" on public.match_events for all using (public.is_admin()) with check (public.is_admin());

alter table public.match_events replica identity full;
alter publication supabase_realtime add table public.match_events;

-- ---------------------------------------------------------------------------
-- Vote MVP du match : un vote par supporter connecté, pendant ou après le match,
-- pour un joueur d'une des deux équipes.
create table if not exists public.mvp_votes (
  match_id   uuid not null references public.matches (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index if not exists mvp_votes_match_idx on public.mvp_votes (match_id);

alter table public.mvp_votes enable row level security;
create policy "mvp_votes_read"       on public.mvp_votes for select using (true);
create policy "mvp_votes_insert_own" on public.mvp_votes for insert with check (user_id = auth.uid());
create policy "mvp_votes_update_own" on public.mvp_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mvp_votes_delete_own" on public.mvp_votes for delete using (user_id = auth.uid());

create or replace function public.guard_mvp_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.matches m
    join public.players p on p.id = new.player_id
    where m.id = new.match_id
      and m.status in ('live', 'finished')
      and p.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'Vote MVP invalide : le match doit être en cours ou terminé et le joueur doit y participer';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_mvp_vote on public.mvp_votes;
create trigger guard_mvp_vote
  before insert or update on public.mvp_votes
  for each row execute function public.guard_mvp_vote();

-- ---------------------------------------------------------------------------
-- Sondages de la fédération : questions à choix multiples, votes des supporters.
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  options    jsonb not null default '[]'::jsonb,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.polls enable row level security;
create policy "polls_read"        on public.polls for select using (is_active or public.is_admin());
create policy "polls_admin_write" on public.polls for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.poll_votes (
  poll_id      uuid not null references public.polls (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  option_index int  not null,
  created_at   timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.poll_votes enable row level security;
create policy "poll_votes_read"       on public.poll_votes for select using (true);
create policy "poll_votes_insert_own" on public.poll_votes for insert with check (user_id = auth.uid());
create policy "poll_votes_update_own" on public.poll_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "poll_votes_delete_own" on public.poll_votes for delete using (user_id = auth.uid());

create or replace function public.guard_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.polls p
    where p.id = new.poll_id
      and p.is_active
      and new.option_index >= 0
      and new.option_index < jsonb_array_length(p.options)
  ) then
    raise exception 'Vote invalide : sondage clos ou option inexistante';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_poll_vote on public.poll_votes;
create trigger guard_poll_vote
  before insert or update on public.poll_votes
  for each row execute function public.guard_poll_vote();

-- ---------------------------------------------------------------------------
-- Pronostics : avant le coup d'envoi, chaque supporter connecté prédit le vainqueur.
create table if not exists public.predictions (
  match_id   uuid not null references public.matches (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index if not exists predictions_match_idx on public.predictions (match_id);

alter table public.predictions enable row level security;
create policy "predictions_read"       on public.predictions for select using (true);
create policy "predictions_insert_own" on public.predictions for insert with check (user_id = auth.uid());
create policy "predictions_update_own" on public.predictions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "predictions_delete_own" on public.predictions for delete using (user_id = auth.uid());

create or replace function public.guard_prediction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.matches m
    where m.id = new.match_id
      and m.status = 'scheduled'
      and new.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'Pronostic invalide : le match a déjà commencé ou l''équipe n''y participe pas';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_prediction on public.predictions;
create trigger guard_prediction
  before insert or update on public.predictions
  for each row execute function public.guard_prediction();
