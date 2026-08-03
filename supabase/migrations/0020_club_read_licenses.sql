-- Lecture des licences par le club concerné.
--
-- Les licences restent créées et modifiées par la fédération (migration 0012).
-- On ouvre seulement la LECTURE au dirigeant, et uniquement pour SON club :
-- il doit pouvoir suivre l'état et l'expiration des licences de son effectif.
-- `to authenticated` : anon ne peut pas exécuter manages_team() (cf. 0019).
drop policy if exists "licenses_club_read" on public.licenses;
create policy "licenses_club_read" on public.licenses
  for select to authenticated
  using (team_id is not null and public.manages_team(team_id));
