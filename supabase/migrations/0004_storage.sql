-- Bucket de stockage public "media" (photos de joueurs, logos de clubs, couvertures d'actus).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Lecture publique, écriture/maj/suppression réservées aux administrateurs.
create policy "media_read" on storage.objects
  for select using (bucket_id = 'media');
create policy "media_admin_insert" on storage.objects
  for insert with check (bucket_id = 'media' and public.is_admin());
create policy "media_admin_update" on storage.objects
  for update using (bucket_id = 'media' and public.is_admin());
create policy "media_admin_delete" on storage.objects
  for delete using (bucket_id = 'media' and public.is_admin());
