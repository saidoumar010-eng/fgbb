import { supabase } from '@/lib/supabase';
import type {
  MatchOfficial,
  OfficialRole,
  Referee,
  RefereeContact,
  RefereeLevel,
  Sanction,
  SanctionKind,
  SanctionStatus,
  Season,
} from '@/lib/types';

// Libellés français des énumérations. Ils servent aussi bien à l'espace admin
// qu'aux écrans publics : on les centralise ici pour éviter les divergences.
export const REFEREE_LEVELS: { id: RefereeLevel; label: string }[] = [
  { id: 'regional', label: 'Régional' },
  { id: 'national', label: 'National' },
  { id: 'fiba', label: 'FIBA' },
];

export const OFFICIAL_ROLES: { id: OfficialRole; label: string }[] = [
  { id: 'principal', label: 'Arbitre principal' },
  { id: 'assistant', label: 'Arbitre assistant' },
  { id: 'table', label: 'Table de marque' },
  { id: 'commissaire', label: 'Commissaire' },
];

export const SANCTION_KINDS: { id: SanctionKind; label: string }[] = [
  { id: 'avertissement', label: 'Avertissement' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'amende', label: 'Amende' },
  { id: 'exclusion', label: 'Exclusion' },
];

export const SANCTION_STATUSES: { id: SanctionStatus; label: string }[] = [
  { id: 'active', label: 'En cours' },
  { id: 'served', label: 'Purgée' },
  { id: 'cancelled', label: 'Annulée' },
];

export function refereeLevelLabel(level?: RefereeLevel | null) {
  return REFEREE_LEVELS.find((l) => l.id === level)?.label ?? '';
}

export function officialRoleLabel(role?: OfficialRole | null) {
  return OFFICIAL_ROLES.find((r) => r.id === role)?.label ?? '';
}

export function sanctionKindLabel(kind?: SanctionKind | null) {
  return SANCTION_KINDS.find((k) => k.id === kind)?.label ?? '';
}

export function sanctionStatusLabel(status?: SanctionStatus | null) {
  return SANCTION_STATUSES.find((s) => s.id === status)?.label ?? '';
}

/** Montant en francs guinéens : séparateur d'espace tous les trois chiffres.
 * Intl.NumberFormat n'est pas garanti sur Hermes, on formate à la main. */
export function formatGnf(amount: number) {
  const digits = Math.round(Math.abs(amount)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${amount < 0 ? '-' : ''}${grouped} GNF`;
}

// ---------------------------------------------------------------------------
// Arbitres

export interface RefereeInput {
  full_name: string;
  city: string | null;
  level: RefereeLevel;
  license_number: string | null;
  photo_url: string | null;
  is_active: boolean;
}

export async function listReferees(activeOnly = false) {
  let q = supabase.from('referees').select('*').order('full_name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Referee[];
}

export async function getReferee(id: string) {
  const { data, error } = await supabase.from('referees').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Referee;
}

/** Crée l'arbitre (id absent) ou le met à jour. Renvoie la ligne : le formulaire
 * a besoin de l'identifiant généré pour enregistrer les coordonnées privées. */
export async function upsertReferee(input: RefereeInput, id?: string | null) {
  const q = id
    ? supabase.from('referees').update(input).eq('id', id)
    : supabase.from('referees').insert(input);
  const { data, error } = await q.select('*').single();
  if (error) throw error;
  return data as Referee;
}

export async function deleteReferee(id: string) {
  const { error } = await supabase.from('referees').delete().eq('id', id);
  if (error) throw error;
}

/** Coordonnées personnelles : table réservée aux admins par RLS. */
export async function getRefereeContact(refereeId: string) {
  const { data, error } = await supabase
    .from('referee_contacts')
    .select('*')
    .eq('referee_id', refereeId)
    .maybeSingle();
  if (error) throw error;
  return (data as RefereeContact) ?? null;
}

export async function upsertRefereeContact(contact: RefereeContact) {
  const { error } = await supabase
    .from('referee_contacts')
    .upsert(contact, { onConflict: 'referee_id' });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Désignations d'arbitres sur un match

export async function listMatchOfficials(matchId: string) {
  const { data, error } = await supabase
    .from('match_officials')
    .select('*, referee:referees(*)')
    .eq('match_id', matchId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as MatchOfficial[];
  // Tri côté client : l'ordre voulu est celui de la feuille de match
  // (principal, assistants, table, commissaire), pas l'ordre alphabétique.
  const rank = (r: OfficialRole) => OFFICIAL_ROLES.findIndex((o) => o.id === r);
  return rows.sort(
    (a, b) => rank(a.role) - rank(b.role) || (a.referee?.full_name ?? '').localeCompare(b.referee?.full_name ?? ''),
  );
}

/** Remplace l'intégralité de la désignation d'un match (table de liaison). */
export async function setMatchOfficials(
  matchId: string,
  officials: { referee_id: string; role: OfficialRole }[],
) {
  const { error: delError } = await supabase.from('match_officials').delete().eq('match_id', matchId);
  if (delError) throw delError;
  if (officials.length === 0) return;
  const { error } = await supabase
    .from('match_officials')
    .insert(officials.map((o) => ({ match_id: matchId, referee_id: o.referee_id, role: o.role })));
  if (error) throw error;
}

export async function removeMatchOfficial(matchId: string, refereeId: string) {
  const { error } = await supabase
    .from('match_officials')
    .delete()
    .eq('match_id', matchId)
    .eq('referee_id', refereeId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Discipline

const SANCTION_SELECT =
  '*, player:players(id, full_name, photo_url, team_id), team:teams(id, name, short_name, color, logo_url)';

export interface SanctionFilters {
  kind?: SanctionKind;
  status?: SanctionStatus;
  limit?: number;
}

export async function listSanctions(filters: SanctionFilters = {}) {
  let q = supabase
    .from('sanctions')
    .select(SANCTION_SELECT)
    .order('decided_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (filters.kind) q = q.eq('kind', filters.kind);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.limit) q = q.limit(filters.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Sanction[];
}

export async function getSanction(id: string) {
  const { data, error } = await supabase.from('sanctions').select(SANCTION_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as unknown as Sanction;
}

export interface SanctionInput {
  player_id: string | null;
  team_id: string | null;
  match_id: string | null;
  kind: SanctionKind;
  games: number;
  amount_gnf: number;
  reason: string | null;
  decided_at: string;
  status: SanctionStatus;
}

export async function upsertSanction(input: SanctionInput, id?: string | null) {
  const { error } = id
    ? await supabase.from('sanctions').update(input).eq('id', id)
    : await supabase.from('sanctions').insert(input);
  if (error) throw error;
}

export async function deleteSanction(id: string) {
  const { error } = await supabase.from('sanctions').delete().eq('id', id);
  if (error) throw error;
}

export async function listSanctionsForPlayer(playerId: string) {
  const { data, error } = await supabase
    .from('sanctions')
    .select(SANCTION_SELECT)
    .eq('player_id', playerId)
    .order('decided_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Sanction[];
}

export async function listSanctionsForTeam(teamId: string) {
  const { data, error } = await supabase
    .from('sanctions')
    .select(SANCTION_SELECT)
    .eq('team_id', teamId)
    .order('decided_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Sanction[];
}

// ---------------------------------------------------------------------------
// Générateur de calendrier

export async function getCurrentSeason() {
  const { data, error } = await supabase.from('seasons').select('*').eq('is_current', true).maybeSingle();
  if (error) throw error;
  return (data as Season) ?? null;
}

export interface NewMatchRow {
  competition_id: string | null;
  season_id: string | null;
  home_team_id: string;
  away_team_id: string;
  round: number;
  scheduled_at: string | null;
  venue: string | null;
}

/** Insertion en lot des matchs générés. Renvoie le nombre de lignes créées. */
export async function createMatches(rows: NewMatchRow[]) {
  if (rows.length === 0) return 0;
  const { data, error } = await supabase
    .from('matches')
    .insert(rows.map((r) => ({ ...r, status: 'scheduled' as const })))
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}
