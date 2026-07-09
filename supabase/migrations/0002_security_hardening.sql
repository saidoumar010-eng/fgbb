-- ============================================================
-- Durcissement de sécurité (suite à l'audit Supabase advisors)
-- ============================================================

-- Les vues respectent la RLS de l'utilisateur qui interroge, pas celle du créateur.
alter view public.team_standings set (security_invoker = on);
alter view public.player_season_stats set (security_invoker = on);

-- handle_new_user() est strictement un trigger : ne pas l'exposer via /rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin() ne sert qu'aux policies d'écriture (utilisateurs connectés) :
-- on retire l'accès à PUBLIC (donc anon) et on le réserve aux comptes authentifiés.
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
