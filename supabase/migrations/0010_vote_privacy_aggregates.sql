-- Durcissement de la fan zone (confidentialité + intégrité des votes).

-- (1) Faille DELETE : les triggers de garde ne couvrent qu'INSERT/UPDATE, donc
-- un utilisateur pouvait SUPPRIMER son pronostic après le coup d'envoi (ou son
-- vote d'un sondage clos) pour fausser les résultats. L'app ne fait que des
-- upserts : on retire purement les politiques DELETE.
drop policy "predictions_delete_own" on public.predictions;
drop policy "poll_votes_delete_own" on public.poll_votes;
drop policy "mvp_votes_delete_own" on public.mvp_votes;

-- (2) Confidentialité : les lignes de vote portent le user_id (auth.users) et le
-- choix. Elles ne doivent être lisibles que par leur auteur — plus de lecture
-- publique ligne par ligne qui exposait les identifiants et le comportement de
-- vote de chaque compte.
drop policy "mvp_votes_read" on public.mvp_votes;
create policy "mvp_votes_read_own" on public.mvp_votes
  for select to authenticated using (user_id = auth.uid());

drop policy "poll_votes_read" on public.poll_votes;
create policy "poll_votes_read_own" on public.poll_votes
  for select to authenticated using (user_id = auth.uid());

drop policy "predictions_read" on public.predictions;
create policy "predictions_read_own" on public.predictions
  for select to authenticated using (user_id = auth.uid());

-- (3) Pourcentages publics via des vues d'AGRÉGATS (aucun user_id exposé).
-- Ces vues appartiennent au propriétaire (postgres) et s'exécutent en droits
-- définisseur : elles comptent toutes les lignes malgré la RLS ci-dessus, et
-- ne renvoient que des totaux — donc pas de troncature à 1000 lignes côté
-- client et pas de fuite de données personnelles.
create or replace view public.mvp_results as
  select match_id, player_id, count(*)::int as votes
  from public.mvp_votes
  group by match_id, player_id;

create or replace view public.poll_results as
  select poll_id, option_index, count(*)::int as votes
  from public.poll_votes
  group by poll_id, option_index;

create or replace view public.prediction_results as
  select match_id, team_id, count(*)::int as votes
  from public.predictions
  group by match_id, team_id;

grant select on public.mvp_results       to anon, authenticated;
grant select on public.poll_results       to anon, authenticated;
grant select on public.prediction_results to anon, authenticated;
