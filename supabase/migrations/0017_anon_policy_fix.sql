-- ============================================================
-- Correctif de sécurité/robustesse sur les tables ajoutées en 0012–0016.
--
-- Rappel (migration 0002) : public.is_admin() n'est exécutable que par les
-- comptes authentifiés. Toute politique évaluée par un visiteur anonyme qui
-- appelle is_admin() échoue donc avec « permission denied for function »,
-- et c'est TOUTE la requête qui tombe, pas seulement la ligne concernée.
--
-- Conséquence concrète évitée ici : dès qu'un commentaire était masqué par la
-- modération, la lecture du fil par un visiteur non connecté plantait.
--
-- Règle appliquée : les politiques qui appellent is_admin() sont réservées à
-- `to authenticated`, et les lectures publiques n'y font jamais référence.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0012 — gestion de la fédération
drop policy if exists "seasons_admin_write" on public.seasons;
create policy "seasons_admin_write" on public.seasons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "licenses_admin_all" on public.licenses;
create policy "licenses_admin_all" on public.licenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "referees_admin_write" on public.referees;
create policy "referees_admin_write" on public.referees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "referee_contacts_admin_all" on public.referee_contacts;
create policy "referee_contacts_admin_all" on public.referee_contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "match_officials_admin_write" on public.match_officials;
create policy "match_officials_admin_write" on public.match_officials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sanctions_admin_write" on public.sanctions;
create policy "sanctions_admin_write" on public.sanctions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "transfers_admin_write" on public.transfers;
create policy "transfers_admin_write" on public.transfers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "club_registrations_select_own_or_admin" on public.club_registrations;
drop policy if exists "club_registrations_insert_own" on public.club_registrations;
drop policy if exists "club_registrations_admin_write" on public.club_registrations;
create policy "club_registrations_select_own_or_admin" on public.club_registrations
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "club_registrations_insert_own" on public.club_registrations
  for insert to authenticated with check (user_id = auth.uid());
create policy "club_registrations_admin_write" on public.club_registrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 0013 — communauté & modération
drop policy if exists "moderation_words_admin_all" on public.moderation_words;
create policy "moderation_words_admin_all" on public.moderation_words
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bans_select_own_or_admin" on public.bans;
drop policy if exists "bans_admin_write" on public.bans;
create policy "bans_select_own_or_admin" on public.bans
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "bans_admin_write" on public.bans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Lecture des commentaires : la partie publique ne connaît que « visible ».
drop policy if exists "comments_read" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;
drop policy if exists "comments_admin_write" on public.comments;
create policy "comments_read" on public.comments
  for select using (status = 'visible');
create policy "comments_read_own_or_admin" on public.comments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "comments_insert_own" on public.comments
  for insert to authenticated with check (user_id = auth.uid());
create policy "comments_delete_own" on public.comments
  for delete to authenticated using (user_id = auth.uid());
create policy "comments_admin_write" on public.comments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "chat_messages_read" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
drop policy if exists "chat_messages_admin_write" on public.chat_messages;
create policy "chat_messages_read" on public.chat_messages
  for select using (status = 'visible');
create policy "chat_messages_read_own_or_admin" on public.chat_messages
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid());
create policy "chat_messages_admin_write" on public.chat_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "reports_select_own_or_admin" on public.reports;
drop policy if exists "reports_insert_own" on public.reports;
drop policy if exists "reports_admin_write" on public.reports;
create policy "reports_select_own_or_admin" on public.reports
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "reports_admin_write" on public.reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 0014 — quiz & classement des supporters
drop policy if exists "quizzes_read" on public.quizzes;
drop policy if exists "quizzes_admin_write" on public.quizzes;
create policy "quizzes_read" on public.quizzes
  for select using (is_active);
create policy "quizzes_admin_read" on public.quizzes
  for select to authenticated using (public.is_admin());
create policy "quizzes_admin_write" on public.quizzes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz_questions_admin_all" on public.quiz_questions;
create policy "quiz_questions_admin_all" on public.quiz_questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz_attempts_select_own_or_admin" on public.quiz_attempts;
create policy "quiz_attempts_select_own_or_admin" on public.quiz_attempts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 0015 — statistiques avancées
drop policy if exists "shots_admin_write" on public.shots;
create policy "shots_admin_write" on public.shots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 0016 — contenus, sponsors, réglages
drop policy if exists "photos_admin_write" on public.photos;
create policy "photos_admin_write" on public.photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "media_items_admin_write" on public.media_items;
create policy "media_items_admin_write" on public.media_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sponsors_admin_write" on public.sponsors;
create policy "sponsors_admin_write" on public.sponsors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bucket privé « documents » : sans `to authenticated`, la simple lecture
-- anonyme du bucket public « media » évaluait aussi cette politique.
drop policy if exists "documents_admin_select" on storage.objects;
drop policy if exists "documents_admin_insert" on storage.objects;
drop policy if exists "documents_admin_update" on storage.objects;
drop policy if exists "documents_admin_delete" on storage.objects;
create policy "documents_admin_select" on storage.objects
  for select to authenticated using (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and public.is_admin());

-- Idem pour le bucket public « media » créé en 0004 : ses politiques d'écriture
-- appelaient is_admin() et étaient évaluées par les visiteurs anonymes.
drop policy if exists "media_admin_insert" on storage.objects;
drop policy if exists "media_admin_update" on storage.objects;
drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "media_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
create policy "media_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());
