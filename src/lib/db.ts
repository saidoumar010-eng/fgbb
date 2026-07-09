import { supabase } from '@/lib/supabase';
import type {
  Competition,
  Match,
  MatchStatus,
  NewsItem,
  Player,
  PlayerMatchStat,
  PlayerSeasonStat,
  Standing,
  Team,
} from '@/lib/types';

export const MATCH_SELECT =
  '*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*), competition:competitions(*)';

export async function listMatches(opts: { status?: MatchStatus | MatchStatus[] } = {}) {
  let q = supabase.from('matches').select(MATCH_SELECT).order('scheduled_at', { ascending: true });
  if (opts.status) {
    q = Array.isArray(opts.status) ? q.in('status', opts.status) : q.eq('status', opts.status);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

export async function getMatch(id: string) {
  const { data, error } = await supabase.from('matches').select(MATCH_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as unknown as Match;
}

export async function getMatchStats(matchId: string) {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select('*, player:players(*)')
    .eq('match_id', matchId)
    .order('points', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PlayerMatchStat[];
}

export async function listTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function getTeam(id: string) {
  const { data, error } = await supabase.from('teams').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Team;
}

export async function getTeamPlayers(teamId: string) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .order('number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function getTeamMatches(teamId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

export async function getTeamStanding(teamId: string) {
  const { data } = await supabase.from('team_standings').select('*').eq('team_id', teamId).maybeSingle();
  return (data as Standing) ?? null;
}

export async function listPlayers() {
  const { data, error } = await supabase.from('players').select('*').order('full_name');
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function getPlayer(id: string) {
  const { data, error } = await supabase
    .from('players')
    .select('*, team:teams(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as Player & { team?: Team };
}

export async function getPlayerSeason(id: string) {
  const { data } = await supabase
    .from('player_season_stats')
    .select('*')
    .eq('player_id', id)
    .maybeSingle();
  return (data as PlayerSeasonStat) ?? null;
}

export async function getPlayerGames(id: string) {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select(
      '*, match:matches!match_id(id, scheduled_at, home_team_id, away_team_id, home_score, away_score, home_team:teams!home_team_id(name,short_name), away_team:teams!away_team_id(name,short_name))',
    )
    .eq('player_id', id)
    .limit(5);
  if (error) throw error;
  return (data ?? []) as unknown as (PlayerMatchStat & { match?: Match })[];
}

export async function listCompetitions() {
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Competition[];
}

export async function getCompetition(id: string) {
  const { data, error } = await supabase.from('competitions').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Competition;
}

export async function listNews() {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as NewsItem[];
}

export async function getNewsItem(id: string) {
  const { data, error } = await supabase.from('news').select('*').eq('id', id).single();
  if (error) throw error;
  return data as NewsItem;
}

export async function listStandings(competitionId?: string) {
  let q = supabase.from('team_standings').select('*').order('points', { ascending: false });
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Standing[];
}

export async function listLeaders() {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .order('ppg', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as PlayerSeasonStat[];
}

export async function listLeadersBy(col: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg') {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .gt('games', 0)
    .order(col, { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as PlayerSeasonStat[];
}

export async function listFavoriteTeams() {
  const { data, error } = await supabase.from('favorites').select('team:teams(*)');
  if (error) throw error;
  return ((data ?? []) as unknown as { team: Team }[]).map((r) => r.team).filter(Boolean);
}

export async function addFavorite(userId: string, teamId: string) {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, team_id: teamId });
  if (error) throw error;
}

export async function removeFavorite(userId: string, teamId: string) {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('team_id', teamId);
  if (error) throw error;
}
