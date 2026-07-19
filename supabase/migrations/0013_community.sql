-- ============================================================
-- Zone supporters : commentaires, chat en direct, signalements,
-- bannissements et filtre anti-insultes.
-- ============================================================

-- Le nom de l'auteur est recopié dans la ligne au moment de l'insertion :
-- la table profiles n'est lisible que par son propriétaire, on ne peut donc
-- pas faire de jointure publique. La dénormalisation garde le temps réel simple.

-- ---------------------------------------------------------------------------
-- Mots interdits (filtre automatique, alimenté par la fédération).
create table if not exists public.moderation_words (
  word       text primary key,
  created_at timestamptz not null default now()
);

alter table public.moderation_words enable row level security;
drop policy if exists "moderation_words_admin_all" on public.moderation_words;
create policy "moderation_words_admin_all" on public.moderation_words
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bannissements : un supporter banni ne peut plus écrire (lecture inchangée).
create table if not exists public.bans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  reason     text,
  until      timestamptz,                    -- null = définitif
  created_at timestamptz not null default now()
);

alter table public.bans enable row level security;
drop policy if exists "bans_select_own_or_admin" on public.bans;
drop policy if exists "bans_admin_write" on public.bans;
create policy "bans_select_own_or_admin" on public.bans
  for select using (user_id = auth.uid() or public.is_admin());
create policy "bans_admin_write" on public.bans
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contrôles communs à tous les messages des supporters :
-- bannissement, langage, limite anti-spam.
create or replace function public.check_can_post(p_body text, p_recent int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_banned record;
  v_word   text;
begin
  select * into v_banned from public.bans
   where user_id = auth.uid() and (until is null or until > now());
  if found then
    raise exception 'Compte suspendu : vous ne pouvez plus publier de messages';
  end if;

  select word into v_word from public.moderation_words
   where lower(p_body) like '%' || lower(word) || '%'
   limit 1;
  if v_word is not null then
    raise exception 'Message refusé : langage inapproprié';
  end if;

  if p_recent >= 10 then
    raise exception 'Trop de messages envoyés, patientez une minute';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Commentaires sur les matchs et les articles.
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('match', 'news')),
  target_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Supporter',
  body        text not null check (length(btrim(body)) between 1 and 1000),
  status      text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists comments_target_idx on public.comments (target_type, target_id, created_at desc);
create index if not exists comments_user_idx on public.comments (user_id);

alter table public.comments enable row level security;
drop policy if exists "comments_read" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;
drop policy if exists "comments_admin_write" on public.comments;
create policy "comments_read" on public.comments
  for select using (status = 'visible' or user_id = auth.uid() or public.is_admin());
create policy "comments_insert_own" on public.comments
  for insert with check (user_id = auth.uid());
create policy "comments_delete_own" on public.comments
  for delete using (user_id = auth.uid());
create policy "comments_admin_write" on public.comments
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  select count(*) into v_recent from public.comments
   where user_id = auth.uid() and created_at > now() - interval '1 minute';
  perform public.check_can_post(new.body, v_recent);

  new.author_name := coalesce(
    nullif(btrim((select full_name from public.profiles where id = new.user_id)), ''),
    'Supporter'
  );
  new.status := 'visible';
  return new;
end;
$$;

drop trigger if exists prepare_comment on public.comments;
create trigger prepare_comment
  before insert on public.comments
  for each row execute function public.prepare_comment();

-- ---------------------------------------------------------------------------
-- Chat en direct pendant un match (messages courts, temps réel).
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Supporter',
  body        text not null check (length(btrim(body)) between 1 and 300),
  status      text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_match_idx on public.chat_messages (match_id, created_at desc);

alter table public.chat_messages enable row level security;
drop policy if exists "chat_messages_read" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
drop policy if exists "chat_messages_admin_write" on public.chat_messages;
create policy "chat_messages_read" on public.chat_messages
  for select using (status = 'visible' or user_id = auth.uid() or public.is_admin());
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (user_id = auth.uid());
create policy "chat_messages_admin_write" on public.chat_messages
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  if not exists (select 1 from public.matches where id = new.match_id and status in ('live', 'finished')) then
    raise exception 'Le chat n''est ouvert que pendant et après le match';
  end if;

  select count(*) into v_recent from public.chat_messages
   where user_id = auth.uid() and created_at > now() - interval '1 minute';
  perform public.check_can_post(new.body, v_recent);

  new.author_name := coalesce(
    nullif(btrim((select full_name from public.profiles where id = new.user_id)), ''),
    'Supporter'
  );
  new.status := 'visible';
  return new;
end;
$$;

drop trigger if exists prepare_chat_message on public.chat_messages;
create trigger prepare_chat_message
  before insert on public.chat_messages
  for each row execute function public.prepare_chat_message();

alter table public.chat_messages replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Signalements : un supporter alerte la fédération sur un message.
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('comment', 'chat')),
  target_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  reason      text,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
drop policy if exists "reports_select_own_or_admin" on public.reports;
drop policy if exists "reports_insert_own" on public.reports;
drop policy if exists "reports_admin_write" on public.reports;
create policy "reports_select_own_or_admin" on public.reports
  for select using (user_id = auth.uid() or public.is_admin());
create policy "reports_insert_own" on public.reports
  for insert with check (user_id = auth.uid());
create policy "reports_admin_write" on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- File de modération : les messages signalés, avec leur contenu, pour l'admin.
create or replace function public.moderation_queue()
returns table (
  report_id   uuid,
  target_type text,
  target_id   uuid,
  reason      text,
  reported_at timestamptz,
  author_name text,
  author_id   uuid,
  body        text,
  status      text,
  reports     bigint
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.target_type, r.target_id, r.reason, r.created_at,
         coalesce(c.author_name, m.author_name),
         coalesce(c.user_id, m.user_id),
         coalesce(c.body, m.body),
         coalesce(c.status, m.status),
         (select count(*) from public.reports r2
           where r2.target_type = r.target_type and r2.target_id = r.target_id)
    from public.reports r
    left join public.comments c      on r.target_type = 'comment' and c.id = r.target_id
    left join public.chat_messages m on r.target_type = 'chat'    and m.id = r.target_id
   where r.status = 'open' and public.is_admin()
   order by r.created_at desc
   limit 200;
$$;

revoke execute on function public.check_can_post(text, int) from anon, authenticated;
revoke execute on function public.prepare_comment() from anon, authenticated;
revoke execute on function public.prepare_chat_message() from anon, authenticated;
