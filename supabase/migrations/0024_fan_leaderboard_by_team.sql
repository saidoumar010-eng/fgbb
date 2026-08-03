-- Phase F — Classement des pronostiqueurs par club.
--
-- Même barème que fan_leaderboard (migration 0014), restreint aux supporters
-- qui ont mis ce club en favori. Reste une fonction security definer : elle
-- appelle fan_points_raw(), dont l'exécution directe est révoquée.
create or replace function public.fan_leaderboard_by_team(p_team_id uuid, p_limit int default 50)
returns table (
  position_no bigint,
  name        text,
  points      bigint,
  predictions bigint,
  correct     bigint,
  is_me       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select row_number() over (order by f.points desc, pr.created_at),
         coalesce(nullif(btrim(pr.full_name), ''), 'Supporter'),
         f.points, f.predictions, f.correct,
         f.user_id = auth.uid()
    from public.fan_points_raw() f
    join public.profiles pr on pr.id = f.user_id
    join public.favorites fav on fav.user_id = f.user_id and fav.team_id = p_team_id
   where pr.show_in_leaderboard and f.points > 0
   order by f.points desc, pr.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function public.fan_leaderboard_by_team(uuid, int) from public;
grant execute on function public.fan_leaderboard_by_team(uuid, int) to anon, authenticated;
