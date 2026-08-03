import { listMatches } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Player, Profile } from '@/lib/types';

/**
 * Jour de match : feuille de match numérique et attribution du rôle table
 * technique. Les garde-fous vivent dans la base (migration 0022) — ce module
 * ne fait que refléter ce que le serveur autorise déjà.
 */

// ---------------------------------------------------------------------------
// Feuille de match : les 12 retenus par une équipe.

export interface TeamLineup {
  playerIds: string[];
  validated: boolean;
}

export async function getMatchLineup(matchId: string, teamId: string): Promise<TeamLineup> {
  const [lineup, status] = await Promise.all([
    supabase.from('match_lineups').select('player_id').eq('match_id', matchId).eq('team_id', teamId),
    supabase
      .from('match_lineup_status')
      .select('validated')
      .eq('match_id', matchId)
      .eq('team_id', teamId)
      .maybeSingle(),
  ]);
  if (lineup.error) throw lineup.error;
  if (status.error) throw status.error;
  return {
    playerIds: ((lineup.data ?? []) as { player_id: string }[]).map((r) => r.player_id),
    validated: !!(status.data as { validated?: boolean } | null)?.validated,
  };
}

/** Remplace l'ensemble des joueurs retenus (table de liaison). */
export async function saveMatchLineup(matchId: string, teamId: string, playerIds: string[]) {
  const { error: delError } = await supabase
    .from('match_lineups')
    .delete()
    .eq('match_id', matchId)
    .eq('team_id', teamId);
  if (delError) throw delError;
  if (playerIds.length > 0) {
    const { error } = await supabase
      .from('match_lineups')
      .insert(playerIds.map((player_id) => ({ match_id: matchId, team_id: teamId, player_id })));
    if (error) throw error;
  }
}

export async function setLineupValidated(matchId: string, teamId: string, validated: boolean) {
  const { error } = await supabase.from('match_lineup_status').upsert(
    {
      match_id: matchId,
      team_id: teamId,
      validated,
      validated_at: validated ? new Date().toISOString() : null,
    },
    { onConflict: 'match_id,team_id' },
  );
  if (error) throw error;
}

// Feuilles des deux équipes d'un match, avec le détail des joueurs — vue de la
// table technique.
export interface MatchLineupSide {
  team_id: string;
  validated: boolean;
  players: Player[];
}

export async function getMatchLineups(matchId: string): Promise<MatchLineupSide[]> {
  const [lineups, status] = await Promise.all([
    supabase.from('match_lineups').select('team_id, player:players(*)').eq('match_id', matchId),
    supabase.from('match_lineup_status').select('team_id, validated').eq('match_id', matchId),
  ]);
  if (lineups.error) throw lineups.error;
  if (status.error) throw status.error;

  const validatedBy = new Map(
    ((status.data ?? []) as { team_id: string; validated: boolean }[]).map((s) => [s.team_id, s.validated]),
  );
  const byTeam = new Map<string, Player[]>();
  for (const row of (lineups.data ?? []) as unknown as { team_id: string; player: Player | null }[]) {
    if (!row.player) continue;
    const list = byTeam.get(row.team_id) ?? [];
    list.push(row.player);
    byTeam.set(row.team_id, list);
  }
  return [...byTeam.entries()].map(([team_id, players]) => ({
    team_id,
    validated: validatedBy.get(team_id) ?? false,
    players: players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
  }));
}

// ---------------------------------------------------------------------------
// Matchs suivis par la table technique : à venir et en direct.

export async function listTableMatches() {
  return listMatches({ status: ['scheduled', 'live'] });
}

// ---------------------------------------------------------------------------
// Attribution du rôle table technique par la fédération.

export async function setUserRole(userId: string, role: 'fan' | 'table_technique') {
  const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
}

export async function listTableOfficials(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'table_technique')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}
