import { getTeamMatches, listStandings } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { License, Match, Player, PlayerSeasonStat, Standing, Team } from '@/lib/types';

/**
 * Espace club délégué.
 *
 * Un dirigeant tient l'effectif de SON club et quelques champs de présentation.
 * Tout ce qui engage la compétition — matchs, scores, licences, transferts —
 * reste à la fédération. Les garde-fous ne sont pas ici mais dans la base
 * (policies RLS + fonctions, migration 0019) : ce module ne fait que refléter
 * ce que le serveur autorise déjà, un client modifié n'ouvre aucune porte.
 */

/** Les clubs dont l'utilisateur connecté est délégué (presque toujours un seul). */
export async function listMyClubs() {
  const { data, error } = await supabase.from('club_members').select('team:teams(*)');
  if (error) throw error;
  return ((data ?? []) as unknown as { team: Team | null }[])
    .map((r) => r.team)
    .filter((t): t is Team => !!t);
}

export async function getClubRoster(teamId: string) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .order('number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Player[];
}

export interface ClubPlayerInput {
  id?: string;
  full_name: string;
  number: number | null;
  position: string | null;
  height_cm: number | null;
  birth_date: string | null;
  photo_url: string | null;
}

/**
 * `team_id` est toujours réaffirmé, y compris en modification : c'est lui que
 * la policy vérifie des deux côtés (ligne visée et ligne résultante). Un
 * changement de club est un transfert, décidé par la fédération.
 */
export async function saveClubPlayer(teamId: string, input: ClubPlayerInput) {
  const payload = {
    full_name: input.full_name.trim(),
    team_id: teamId,
    number: input.number,
    position: input.position,
    height_cm: input.height_cm,
    birth_date: input.birth_date,
    photo_url: input.photo_url,
  };
  const q = input.id
    ? supabase.from('players').update(payload).eq('id', input.id)
    : supabase.from('players').insert(payload);
  const { error } = await q;
  if (error) throw error;
}

export async function removeClubPlayer(playerId: string) {
  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) throw error;
}

/**
 * Fiche du club : passe par une fonction serveur qui n'accepte que les champs
 * de présentation. Les policies RLS ne savent pas restreindre les colonnes —
 * sans elle, un dirigeant pourrait renommer son club ou le déclarer équipe
 * nationale.
 */
export async function updateMyClub(input: {
  team_id: string;
  coach: string | null;
  city: string | null;
  color: string | null;
  logo_url: string | null;
}) {
  const { error } = await supabase.rpc('update_my_club', {
    p_team_id: input.team_id,
    p_coach: input.coach,
    p_city: input.city,
    p_color: input.color,
    p_logo_url: input.logo_url,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Côté fédération : accorder ou retirer la délégation.

export interface ClubDelegate {
  user_id: string;
  team_id: string;
  created_at: string;
  team?: Team;
}

export async function listClubDelegates() {
  const { data, error } = await supabase
    .from('club_members')
    .select('*, team:teams(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ClubDelegate[];
}

export async function addClubDelegate(userId: string, teamId: string) {
  const { error } = await supabase.from('club_members').insert({ user_id: userId, team_id: teamId });
  if (error) throw error;
}

export async function removeClubDelegate(userId: string, teamId: string) {
  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('user_id', userId)
    .eq('team_id', teamId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tableau de bord : une vue d'ensemble du club à partir des données publiques
// (matchs, classement, moyennes). Rien de sensible ici, juste un regroupement
// pratique pour le dirigeant.

// Un match sans date programmée passe en fin de liste plutôt qu'en tête.
function matchTime(iso?: string | null) {
  const n = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(n) ? -Infinity : n;
}

/** Meilleur marqueur du club à la moyenne (vue player_season_stats). */
export async function getClubTopScorer(teamId: string): Promise<PlayerSeasonStat | null> {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .eq('team_id', teamId)
    .order('ppg', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PlayerSeasonStat) ?? null;
}

export interface ClubDashboard {
  nextMatch: Match | null;
  lastMatch: Match | null;
  standing: Standing | null;
  rank: number | null; // place au classement général, 1 = premier
  topScorer: PlayerSeasonStat | null;
}

export async function getClubDashboard(teamId: string): Promise<ClubDashboard> {
  const [matches, standings, topScorer] = await Promise.all([
    getTeamMatches(teamId),
    listStandings(),
    getClubTopScorer(teamId),
  ]);

  const now = Date.now();
  const scheduled = matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => matchTime(a.scheduled_at) - matchTime(b.scheduled_at));
  // Le prochain match à venir ; à défaut (tous passés/sans date) le premier programmé.
  const nextMatch = scheduled.find((m) => matchTime(m.scheduled_at) >= now) ?? scheduled[0] ?? null;

  const lastMatch =
    matches
      .filter((m) => m.status === 'finished')
      .sort((a, b) => matchTime(b.scheduled_at) - matchTime(a.scheduled_at))[0] ?? null;

  const idx = standings.findIndex((s) => s.team_id === teamId);
  return {
    nextMatch,
    lastMatch,
    standing: idx >= 0 ? standings[idx] : null,
    rank: idx >= 0 ? idx + 1 : null,
    topScorer,
  };
}

// ---------------------------------------------------------------------------
// Licences du club : lecture seule. La fédération reste seule à délivrer et
// modifier les licences ; le dirigeant ne fait que suivre l'état et l'expiration
// de celles de son effectif (policy licenses_club_read, migration 0020).

export async function listClubLicenses(teamId: string): Promise<License[]> {
  const { data, error } = await supabase
    .from('licenses')
    .select('*, player:players(*), season:seasons(*)')
    .eq('team_id', teamId);
  if (error) throw error;
  return (data ?? []) as unknown as License[];
}
