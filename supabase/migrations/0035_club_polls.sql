-- Sondages de club : un dirigeant peut créer/gérer les sondages de SON équipe.
-- team_id null = sondage de la fédération (comportement historique inchangé).
alter table public.polls add column if not exists team_id uuid references public.teams(id) on delete cascade;
create index if not exists polls_team_id_idx on public.polls(team_id);

-- Lecture par le dirigeant de ses propres sondages (y compris inactifs, pour l'édition).
drop policy if exists polls_club_read on public.polls;
create policy polls_club_read on public.polls
  for select to authenticated
  using (team_id is not null and public.manages_team(team_id));

-- Écriture (création/modif/suppression) bornée à l'équipe du dirigeant.
drop policy if exists polls_club_write on public.polls;
create policy polls_club_write on public.polls
  for all to authenticated
  using (team_id is not null and public.manages_team(team_id))
  with check (team_id is not null and public.manages_team(team_id));
