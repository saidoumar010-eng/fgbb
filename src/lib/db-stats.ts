import { MATCH_SELECT } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { GameHigh, Match, PlayerMatchStat, TeamSeasonStat } from '@/lib/types';

// Colonnes de la vue `game_highs` sur lesquelles on peut établir un record.
export type HighColumn = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'three_made';

/** Performance individuelle enrichie du nom court de l'adversaire (absent de la vue). */
export interface RecordRow extends GameHigh {
  opponent: string | null;
}

export interface RecordCategory {
  key: HighColumn;
  label: string;
  unit: string;
  rows: RecordRow[];
}

export interface MatchSheet {
  match: Match;
  stats: PlayerMatchStat[];
}

// ---------------------------------------------------------------------------
// Bilans d'équipe

/**
 * La vue renvoie une ligne par (équipe, compétition). Sans filtre de
 * compétition on fusionne ces lignes pour n'afficher qu'un bilan par club.
 */
export async function listTeamSeasonStats(competitionId?: string | null) {
  let q = supabase.from('team_season_stats').select('*');
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as TeamSeasonStat[];
  return competitionId ? rows.map(normalize) : mergeByTeam(rows);
}

export async function getTeamSeasonStat(teamId: string) {
  const { data, error } = await supabase.from('team_season_stats').select('*').eq('team_id', teamId);
  if (error) throw error;
  const merged = mergeByTeam((data ?? []) as TeamSeasonStat[]);
  return merged[0] ?? null;
}

// Les moyennes sont pondérées par le nombre de matchs : additionner deux
// moyennes de compétitions au volume différent fausserait le bilan.
function mergeByTeam(rows: TeamSeasonStat[]): TeamSeasonStat[] {
  const acc = new Map<string, { row: TeamSeasonStat; pf: number; pa: number }>();
  for (const raw of rows) {
    const r = normalize(raw);
    const cur = acc.get(r.team_id);
    if (!cur) {
      acc.set(r.team_id, { row: { ...r, competition_id: null }, pf: r.pts_for * r.games, pa: r.pts_against * r.games });
      continue;
    }
    cur.row.games += r.games;
    cur.row.wins += r.wins;
    cur.row.losses += r.losses;
    cur.row.best_score = Math.max(cur.row.best_score, r.best_score);
    cur.pf += r.pts_for * r.games;
    cur.pa += r.pts_against * r.games;
  }
  return [...acc.values()].map(({ row, pf, pa }) => {
    const g = row.games || 1;
    row.pts_for = round1(pf / g);
    row.pts_against = round1(pa / g);
    row.diff = round1(row.pts_for - row.pts_against);
    return row;
  });
}

// PostgREST peut renvoyer les colonnes `numeric` sous forme de chaîne.
function normalize(r: TeamSeasonStat): TeamSeasonStat {
  return {
    ...r,
    games: Number(r.games),
    wins: Number(r.wins),
    losses: Number(r.losses),
    pts_for: Number(r.pts_for),
    pts_against: Number(r.pts_against),
    diff: Number(r.diff),
    best_score: Number(r.best_score),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Records de la saison

export async function listGameHighs(column: HighColumn, limit = 5) {
  const { data, error } = await supabase
    .from('game_highs')
    .select('*')
    .gt(column, 0)
    .order(column, { ascending: false })
    .order('scheduled_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return attachOpponents((data ?? []) as GameHigh[]);
}

const RECORD_CATEGORIES: { key: HighColumn; label: string; unit: string }[] = [
  { key: 'points', label: 'Points', unit: 'pts' },
  { key: 'rebounds', label: 'Rebonds', unit: 'reb' },
  { key: 'assists', label: 'Passes', unit: 'pd' },
  { key: 'steals', label: 'Interceptions', unit: 'int' },
  { key: 'blocks', label: 'Contres', unit: 'ctr' },
  { key: 'three_made', label: 'Tirs à 3 pts', unit: '3 pts' },
];

/** Toutes les catégories de records en une fois (écran « Records de la saison »). */
export async function listSeasonRecords(limit = 6): Promise<RecordCategory[]> {
  const lists = await Promise.all(RECORD_CATEGORIES.map((c) => listGameHighs(c.key, limit)));
  return RECORD_CATEGORIES.map((c, i) => ({ ...c, rows: lists[i] }));
}

/**
 * La vue `game_highs` ne porte pas l'adversaire : on résout les matchs
 * concernés en une requête et on en déduit l'équipe d'en face.
 */
async function attachOpponents(rows: GameHigh[]): Promise<RecordRow[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.match_id))];
  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, home_team_id, away_team_id, home_team:teams!home_team_id(name, short_name), away_team:teams!away_team_id(name, short_name)',
    )
    .in('id', ids);
  if (error) throw error;

  type Row = {
    id: string;
    home_team_id: string;
    away_team_id: string;
    home_team?: { name: string | null; short_name: string | null } | null;
    away_team?: { name: string | null; short_name: string | null } | null;
  };
  const byId = new Map((data as unknown as Row[] | null)?.map((m) => [m.id, m]) ?? []);

  return rows.map((r) => {
    const m = byId.get(r.match_id);
    // `team_id` vient du club actuel du joueur : après un transfert il peut ne
    // correspondre à aucune des deux équipes du match, on n'invente rien.
    const other =
      !m || (r.team_id !== m.home_team_id && r.team_id !== m.away_team_id)
        ? null
        : r.team_id === m.home_team_id
          ? m.away_team
          : m.home_team;
    return { ...r, opponent: other ? teamShort(other) : null };
  });
}

// ---------------------------------------------------------------------------
// Export de la feuille de match

export async function getMatchSheetData(matchId: string): Promise<MatchSheet> {
  const [match, stats] = await Promise.all([
    supabase.from('matches').select(MATCH_SELECT).eq('id', matchId).single(),
    supabase
      .from('player_match_stats')
      .select('*, player:players(*)')
      .eq('match_id', matchId)
      .order('points', { ascending: false }),
  ]);
  if (match.error) throw match.error;
  if (stats.error) throw stats.error;
  return {
    match: match.data as unknown as Match,
    stats: (stats.data ?? []) as unknown as PlayerMatchStat[],
  };
}
