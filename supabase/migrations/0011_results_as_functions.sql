-- Les vues d'agrégats de 0010 étaient signalées ERROR « security_definer_view ».
-- On les remplace par des fonctions RPC security definer (motif recommandé par
-- Supabase pour exposer des agrégats au-dessus de tables protégées par RLS) :
-- elles comptent toutes les lignes sans jamais exposer le moindre user_id.
drop view if exists public.mvp_results;
drop view if exists public.poll_results;
drop view if exists public.prediction_results;

create or replace function public.mvp_results(p_match_id uuid)
returns table(player_id uuid, votes int)
language sql
security definer
stable
set search_path = public
as $$
  select player_id, count(*)::int
  from public.mvp_votes
  where match_id = p_match_id
  group by player_id
$$;

create or replace function public.poll_results(p_poll_id uuid)
returns table(option_index int, votes int)
language sql
security definer
stable
set search_path = public
as $$
  select option_index, count(*)::int
  from public.poll_votes
  where poll_id = p_poll_id
  group by option_index
$$;

create or replace function public.prediction_results(p_match_id uuid)
returns table(team_id uuid, votes int)
language sql
security definer
stable
set search_path = public
as $$
  select team_id, count(*)::int
  from public.predictions
  where match_id = p_match_id
  group by team_id
$$;

-- Accessibles au public (pourcentages visibles sans compte), rien d'autre.
revoke execute on function public.mvp_results(uuid) from public;
revoke execute on function public.poll_results(uuid) from public;
revoke execute on function public.prediction_results(uuid) from public;
grant execute on function public.mvp_results(uuid)       to anon, authenticated;
grant execute on function public.poll_results(uuid)       to anon, authenticated;
grant execute on function public.prediction_results(uuid) to anon, authenticated;
