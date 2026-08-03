-- Phase I — Statistiques avancées & audience de la fédération.

-- ---------------------------------------------------------------------------
-- 1) Four factors par équipe, agrégés sur la saison (données publiques).
--    Vue détenue par postgres : comme les autres vues stats, elle agrège des
--    box scores déjà publics.
create or replace view public.team_advanced_stats as
select
  s.team_id,
  t.name       as team_name,
  t.short_name,
  t.color,
  count(distinct s.match_id)                                            as games,
  round(100.0 * (sum(s.fg_made) + 0.5 * sum(s.three_made))
        / nullif(sum(s.fg_att), 0), 1)                                  as efg_pct,
  round(100.0 * sum(s.turnovers)
        / nullif(sum(s.fg_att) + 0.44 * sum(s.ft_att) + sum(s.turnovers), 0), 1) as tov_pct,
  round(100.0 * sum(s.off_rebounds)
        / nullif(sum(s.fg_att) - sum(s.fg_made), 0), 1)                 as orb_pct,
  round(100.0 * sum(s.ft_made) / nullif(sum(s.fg_att), 0), 1)          as ft_rate,
  round(sum(s.points)::numeric / nullif(count(distinct s.match_id), 0), 1) as ppg
from public.player_match_stats s
join public.teams t on t.id = s.team_id
where s.team_id is not null
group by s.team_id, t.name, t.short_name, t.color;

grant select on public.team_advanced_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Audience globale, réservée à la fédération (agrégats, aucune donnée
--    individuelle). Les favoris/pronostics ne sont pas lisibles en masse par
--    les clients : on passe par des fonctions security definer gardées.
create or replace function public.federation_stats()
returns table (
  fans          bigint,
  predictions   bigint,
  mvp_votes     bigint,
  poll_votes    bigint,
  quiz_attempts bigint,
  club_posts    bigint,
  follows       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à la fédération.';
  end if;
  return query select
    (select count(*) from public.profiles where role = 'fan'),
    (select count(*) from public.predictions),
    (select count(*) from public.mvp_votes),
    (select count(*) from public.poll_votes),
    (select count(*) from public.quiz_attempts),
    (select count(*) from public.club_posts),
    (select count(*) from public.player_follows);
end;
$$;
revoke execute on function public.federation_stats() from public, anon;
grant execute on function public.federation_stats() to authenticated;

create or replace function public.top_followed_teams(p_limit int default 6)
returns table (team_id uuid, team_name text, followers bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à la fédération.';
  end if;
  return query
    select f.team_id, t.name, count(*)::bigint
      from public.favorites f
      join public.teams t on t.id = f.team_id
     group by f.team_id, t.name
     order by count(*) desc
     limit greatest(1, least(coalesce(p_limit, 6), 50));
end;
$$;
revoke execute on function public.top_followed_teams(int) from public, anon;
grant execute on function public.top_followed_teams(int) to authenticated;
