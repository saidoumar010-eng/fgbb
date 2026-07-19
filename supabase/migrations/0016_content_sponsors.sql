-- ============================================================
-- Contenus & médias : galeries photos, agenda de la fédération,
-- médiathèque (interviews / podcasts), sponsors, réglages du club.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Photos : rattachées à un match, ou regroupées dans un album libre.
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid references public.matches (id) on delete cascade,
  album      text,
  url        text not null,
  caption    text,
  credit     text,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists photos_match_idx on public.photos (match_id, position);
create index if not exists photos_album_idx on public.photos (album);

alter table public.photos enable row level security;
drop policy if exists "photos_read" on public.photos;
drop policy if exists "photos_admin_write" on public.photos;
create policy "photos_read"        on public.photos for select using (true);
create policy "photos_admin_write" on public.photos for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Agenda de la fédération : assemblées, stages, tirages au sort, finales.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text not null default 'federation'
              check (category in ('federation', 'competition', 'formation', 'ceremonie', 'autre')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  location    text,
  cover_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);

alter table public.events enable row level security;
drop policy if exists "events_read" on public.events;
drop policy if exists "events_admin_write" on public.events;
create policy "events_read"        on public.events for select using (true);
create policy "events_admin_write" on public.events for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Médiathèque : interviews, podcasts, reportages (liens externes).
create table if not exists public.media_items (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'interview'
               check (kind in ('interview', 'podcast', 'reportage', 'video')),
  title        text not null,
  description  text,
  url          text not null,
  cover_url    text,
  duration_min int,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists media_items_published_idx on public.media_items (published_at desc);

alter table public.media_items enable row level security;
drop policy if exists "media_items_read" on public.media_items;
drop policy if exists "media_items_admin_write" on public.media_items;
create policy "media_items_read"        on public.media_items for select using (true);
create policy "media_items_admin_write" on public.media_items for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Sponsors & partenaires officiels (affichage uniquement, aucune transaction).
create table if not exists public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  url        text,
  tier       text not null default 'partenaire'
             check (tier in ('principal', 'officiel', 'media', 'partenaire')),
  placement  text not null default 'tous'
             check (placement in ('accueil', 'match', 'tous')),
  position   int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sponsors_active_idx on public.sponsors (is_active, position);

alter table public.sponsors enable row level security;
drop policy if exists "sponsors_read" on public.sponsors;
drop policy if exists "sponsors_admin_write" on public.sponsors;
create policy "sponsors_read"        on public.sponsors for select using (true);
create policy "sponsors_admin_write" on public.sponsors for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Réglages libres de la fédération (à propos, contacts, réseaux sociaux).
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;
drop policy if exists "settings_read" on public.settings;
drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_read"        on public.settings for select using (true);
create policy "settings_admin_write" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Traductions anglaises optionnelles des actualités (l'app est bilingue).
alter table public.news add column if not exists title_en text;
alter table public.news add column if not exists body_en  text;

-- ---------------------------------------------------------------------------
-- Bucket privé pour les documents administratifs (justificatifs de licence).
-- Contrairement au bucket "media", il n'est PAS public : la consultation passe
-- par une URL signée générée pour un administrateur.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_admin_select" on storage.objects;
drop policy if exists "documents_admin_insert" on storage.objects;
drop policy if exists "documents_admin_update" on storage.objects;
drop policy if exists "documents_admin_delete" on storage.objects;
create policy "documents_admin_select" on storage.objects
  for select using (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_update" on storage.objects
  for update using (bucket_id = 'documents' and public.is_admin());
create policy "documents_admin_delete" on storage.objects
  for delete using (bucket_id = 'documents' and public.is_admin());
