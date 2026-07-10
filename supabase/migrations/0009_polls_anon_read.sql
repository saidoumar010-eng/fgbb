-- Correctif : les anonymes ne peuvent pas exécuter is_admin() (restreint en 0002).
-- Or la politique de lecture des sondages l'appelait, ce qui bloquait toute
-- lecture anonyme (401). On scinde les politiques par rôle : les anonymes ne
-- touchent plus jamais is_admin().
drop policy "polls_read" on public.polls;
create policy "polls_read" on public.polls for select using (is_active);
create policy "polls_admin_read" on public.polls for select to authenticated using (public.is_admin());

drop policy "polls_admin_write" on public.polls;
create policy "polls_admin_write" on public.polls
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cohérence : les politiques admin des autres tables de la fan zone ne
-- s'appliquent qu'aux utilisateurs connectés.
drop policy "match_events_admin_write" on public.match_events;
create policy "match_events_admin_write" on public.match_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
