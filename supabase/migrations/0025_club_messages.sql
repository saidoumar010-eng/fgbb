-- Phase G — Messagerie fédération → clubs.
--
-- La fédération adresse un message à un ou plusieurs clubs. Chaque club voit
-- ses messages et l'accusé de lecture est enregistré par équipe. Écriture
-- réservée à l'admin ; lecture ouverte au(x) club(s) destinataire(s).

create table if not exists public.club_messages (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_message_recipients (
  message_id uuid not null references public.club_messages (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  read_at    timestamptz,
  read_by    uuid references auth.users (id) on delete set null,
  primary key (message_id, team_id)
);
create index if not exists cmr_team_idx on public.club_message_recipients (team_id);

alter table public.club_messages enable row level security;
alter table public.club_message_recipients enable row level security;

-- Messages : l'admin gère tout ; un club lit ceux qui lui sont adressés.
drop policy if exists "club_messages_admin_all" on public.club_messages;
create policy "club_messages_admin_all" on public.club_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "club_messages_recipient_read" on public.club_messages;
create policy "club_messages_recipient_read" on public.club_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.club_message_recipients r
       where r.message_id = id and public.manages_team(r.team_id)
    )
  );

-- Destinataires : l'admin gère ; un club lit ses propres lignes.
drop policy if exists "cmr_admin_all" on public.club_message_recipients;
create policy "cmr_admin_all" on public.club_message_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cmr_club_read" on public.club_message_recipients;
create policy "cmr_club_read" on public.club_message_recipients
  for select to authenticated using (public.manages_team(team_id));

-- Accusé de lecture : passe par une fonction (les clubs n'ont pas d'UPDATE
-- direct, on évite qu'ils touchent autre chose que read_at).
create or replace function public.mark_club_messages_read(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.manages_team(p_team_id) or public.is_admin()) then
    raise exception 'Accès réservé au club.';
  end if;
  update public.club_message_recipients
     set read_at = now(), read_by = auth.uid()
   where team_id = p_team_id and read_at is null;
end;
$$;
revoke execute on function public.mark_club_messages_read(uuid) from public, anon;
grant execute on function public.mark_club_messages_read(uuid) to authenticated;
