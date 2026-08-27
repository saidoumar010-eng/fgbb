-- Vague 2 « Visibilité » — vitrine du club :
-- 1) texte de présentation (histoire) du club
-- 2) galerie photos par club (colonne team_id sur photos + RLS bornées par manages_team)
-- 3) update_my_club étendu (présentation + année de fondation)

-- 1) présentation du club
alter table public.teams add column if not exists presentation text;

-- 2) galerie photos par club
alter table public.photos add column if not exists team_id uuid references public.teams(id) on delete cascade;
create index if not exists photos_team_id_idx on public.photos(team_id);

-- RLS : le responsable du club gère les photos de SON club (team_id) ;
-- lecture publique et écriture admin déjà en place (photos_read / photos_admin_write).
drop policy if exists photos_club_insert on public.photos;
create policy photos_club_insert on public.photos
  for insert to authenticated
  with check (team_id is not null and public.manages_team(team_id));

drop policy if exists photos_club_update on public.photos;
create policy photos_club_update on public.photos
  for update to authenticated
  using (team_id is not null and public.manages_team(team_id))
  with check (team_id is not null and public.manages_team(team_id));

drop policy if exists photos_club_delete on public.photos;
create policy photos_club_delete on public.photos
  for delete to authenticated
  using (team_id is not null and public.manages_team(team_id));

-- 3) update_my_club : ajoute présentation + année de fondation (défauts pour compat)
drop function if exists public.update_my_club(uuid, text, text, text, text);
create function public.update_my_club(
  p_team_id uuid,
  p_coach text,
  p_city text,
  p_color text,
  p_logo_url text,
  p_presentation text default null,
  p_founded_year int default null
) returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.manages_team(p_team_id) then
    raise exception 'Vous ne dirigez pas ce club.';
  end if;
  update public.teams
     set coach        = p_coach,
         city         = p_city,
         color        = p_color,
         logo_url     = p_logo_url,
         presentation = p_presentation,
         founded_year = p_founded_year
   where id = p_team_id;
end;
$function$;

revoke execute on function public.update_my_club(uuid, text, text, text, text, text, int) from public, anon;
grant execute on function public.update_my_club(uuid, text, text, text, text, text, int) to authenticated, service_role;
