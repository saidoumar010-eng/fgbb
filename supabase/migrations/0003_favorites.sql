-- Équipes favorites des supporters (chacun gère les siennes).
create table if not exists public.favorites (
  user_id    uuid not null references auth.users (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table public.favorites enable row level security;

create policy "favorites_select_own" on public.favorites for select using (user_id = auth.uid());
create policy "favorites_insert_own" on public.favorites for insert with check (user_id = auth.uid());
create policy "favorites_delete_own" on public.favorites for delete using (user_id = auth.uid());
