import { distanceToBasket, isPaint } from '@/components/court';
import { supabase } from '@/lib/supabase';
import type { ProgressionPoint, Shot } from '@/lib/types';

const SHOT_SELECT = '*, player:players(id, full_name, number, team_id)';

/** Tirs d'un match, du plus récent au plus ancien (le premier est « le dernier tir »). */
export async function listShots(matchId: string) {
  const { data, error } = await supabase
    .from('shots')
    .select(SHOT_SELECT)
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Shot[];
}

export async function listShotsByPlayer(playerId: string) {
  const { data, error } = await supabase
    .from('shots')
    .select(SHOT_SELECT)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Shot[];
}

export interface NewShot {
  match_id: string;
  player_id: string | null;
  team_id: string | null;
  x: number;
  y: number;
  points: 1 | 2 | 3;
  made: boolean;
  quarter?: number | null;
}

/** Insère un tir et renvoie la ligne créée, pour l'ajouter à l'écran sans recharger. */
export async function addShot(shot: NewShot) {
  const { data, error } = await supabase.from('shots').insert(shot).select(SHOT_SELECT).single();
  if (error) throw error;
  return data as unknown as Shot;
}

export async function deleteShot(id: string) {
  const { error } = await supabase.from('shots').delete().eq('id', id);
  if (error) throw error;
}

export async function clearMatchShots(matchId: string) {
  const { error } = await supabase.from('shots').delete().eq('match_id', matchId);
  if (error) throw error;
}

export async function getPlayerProgression(playerId: string, limit = 15) {
  const { data, error } = await supabase.rpc('player_progression', {
    p_player_id: playerId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ProgressionPoint[];
}

// ---------------------------------------------------------------------------
// Répartition par zone (calcul local, aucune requête).

export type ShotZone = 'rim' | 'paint' | 'mid' | 'three' | 'ft';

export interface ZoneStat {
  zone: ShotZone;
  /** Libellé français : sert aussi de clé de traduction. */
  label: string;
  made: number;
  att: number;
  /** Pourcentage de réussite arrondi, 0 si aucune tentative. */
  pct: number;
}

const ZONE_LABELS: Record<ShotZone, string> = {
  rim: 'Sous le panier',
  paint: 'Raquette',
  mid: 'Mi-distance',
  three: '3 points',
  ft: 'Lancers francs',
};

const ZONE_ORDER: ShotZone[] = ['rim', 'paint', 'mid', 'three', 'ft'];

/**
 * Zone d'un tir. Le type saisi tranche 2 contre 3 points — l'admin a vu
 * l'action, la géométrie ne sert qu'à découper les tirs à 2 points.
 */
export function shotZone(shot: Pick<Shot, 'x' | 'y' | 'points'>): ShotZone {
  if (shot.points === 1) return 'ft';
  if (shot.points === 3) return 'three';
  if (distanceToBasket(shot.x, shot.y) <= 1.5) return 'rim';
  return isPaint(shot.x, shot.y) ? 'paint' : 'mid';
}

/** Réussis / tentés / pourcentage par zone, zones vides comprises. */
export function shotZoneSummary(shots: Shot[]): ZoneStat[] {
  const acc = {} as Record<ShotZone, { made: number; att: number }>;
  ZONE_ORDER.forEach((z) => (acc[z] = { made: 0, att: 0 }));

  for (const s of shots) {
    const z = shotZone(s);
    acc[z].att += 1;
    if (s.made) acc[z].made += 1;
  }

  return ZONE_ORDER.map((z) => ({
    zone: z,
    label: ZONE_LABELS[z],
    made: acc[z].made,
    att: acc[z].att,
    pct: acc[z].att === 0 ? 0 : Math.round((acc[z].made / acc[z].att) * 100),
  }));
}
