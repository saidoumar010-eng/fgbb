-- Durcissement : les fonctions de garde (triggers) ne doivent pas être
-- appelables via l'API REST (/rpc). Elles ne servent qu'aux triggers.
revoke execute on function public.guard_mvp_vote() from public, anon, authenticated;
revoke execute on function public.guard_poll_vote() from public, anon, authenticated;
revoke execute on function public.guard_prediction() from public, anon, authenticated;
