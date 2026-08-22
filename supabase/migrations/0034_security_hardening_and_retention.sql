-- 0034 — Renforcement de la sécurité de la base + politique de conservation
-- (appliqué au projet distant sous le nom « 0033_security_hardening_and_retention »,
--  renuméroté 0034 en local car 0033_team_gender.sql existait déjà).
-- Aucune donnée n'est supprimée par cette migration : elle durcit les accès
-- (privilèges EXECUTE) et documente les durées de conservation.

------------------------------------------------------------------------
-- 1) Vue d'analyse en SECURITY DEFINER -> SECURITY INVOKER
--    team_advanced_stats contournait la RLS (droits du créateur).
--    Les tables sources (player_match_stats, teams) ont une RLS SELECT
--    publique (using true) : la vue reste lisible par tous, mais sans
--    privilège élevé — elle applique désormais la RLS de l'appelant.
------------------------------------------------------------------------
alter view public.team_advanced_stats set (security_invoker = on);

------------------------------------------------------------------------
-- 2) Fonctions "trigger" : ne doivent jamais être appelables via l'API RPC.
--    Retirer EXECUTE ne désactive pas les déclencheurs (leur exécution ne
--    dépend pas du privilège EXECUTE de l'appelant).
------------------------------------------------------------------------
revoke execute on function
  public.apply_transfer(),
  public.guard_mvp_vote(),
  public.guard_poll_vote(),
  public.guard_prediction(),
  public.guard_profile_role(),
  public.guard_registration_status(),
  public.handle_new_user(),
  public.prepare_chat_message(),
  public.prepare_comment()
from public, anon, authenticated;

------------------------------------------------------------------------
-- 3) Fonctions sensibles (administration / gestion de club) : on retire
--    l'accès au visiteur anonyme. Le rôle "authenticated" garde l'accès ;
--    le contrôle fin reste dans la fonction (is_admin(), manages_team()).
------------------------------------------------------------------------
revoke execute on function public.admin_list_accounts()                         from public, anon;
revoke execute on function public.admin_set_role(uuid, text)                    from public, anon;
revoke execute on function public.set_user_role(uuid, text)                     from public, anon;
revoke execute on function public.search_accounts(text)                         from public, anon;
revoke execute on function public.moderation_queue()                            from public, anon;
revoke execute on function public.update_my_club(uuid, text, text, text, text)  from public, anon;
revoke execute on function public.mark_club_messages_read(uuid)                 from public, anon;

grant execute on function public.admin_list_accounts()                         to authenticated, service_role;
grant execute on function public.admin_set_role(uuid, text)                    to authenticated, service_role;
grant execute on function public.set_user_role(uuid, text)                     to authenticated, service_role;
grant execute on function public.search_accounts(text)                         to authenticated, service_role;
grant execute on function public.moderation_queue()                            to authenticated, service_role;
grant execute on function public.update_my_club(uuid, text, text, text, text)  to authenticated, service_role;
grant execute on function public.mark_club_messages_read(uuid)                 to authenticated, service_role;

------------------------------------------------------------------------
-- 4) Durées de conservation documentées au niveau de la base (traçabilité).
------------------------------------------------------------------------
comment on table public.chat_messages is
  'Chat en direct des matchs. Conservation : 12 mois glissants (donnee ephemere).';
comment on table public.comments is
  'Commentaires des supporters. Conservation : tant que le compte est actif ; supprimes avec le compte.';
comment on table public.reports is
  'Signalements de moderation. Conservation : 12 mois apres traitement.';
comment on table public.bans is
  'Bannissements. Conservation : duree du bannissement + 24 mois (preuve).';
comment on table public.profiles is
  'Profils utilisateurs. Conservation : tant que le compte est actif ; suppression sous 30 jours apres demande.';
