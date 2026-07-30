import { supabase } from '@/lib/supabase';
import type {
  Competition,
  Match,
  MatchEvent,
  MatchEventKind,
  MatchStatus,
  MvpVote,
  NewsItem,
  Player,
  PlayerMatchStat,
  PlayerSeasonStat,
  Poll,
  PollVote,
  Prediction,
  Standing,
  Team,
} from '@/lib/types';

export const MATCH_SELECT =
  '*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*), competition:competitions(*)';

// Plafond de sécurité : l'accueil et l'onglet Matchs chargent tout le calendrier.
// Au fil des saisons cela finirait par buter sur la limite de 1000 lignes de
// PostgREST — silencieusement, en tronquant les matchs les plus récents.
const MATCH_PAGE = 400;

export async function listMatches(opts: { status?: MatchStatus | MatchStatus[]; limit?: number } = {}) {
  let q = supabase.from('matches').select(MATCH_SELECT).order('scheduled_at', { ascending: true });
  if (opts.status) {
    q = Array.isArray(opts.status) ? q.in('status', opts.status) : q.eq('status', opts.status);
  }
  const { data, error } = await q.limit(opts.limit ?? MATCH_PAGE);
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

/**
 * Les N derniers matchs du joueur, du plus récent au plus ancien.
 *
 * La date vit sur `matches`, pas sur `player_match_stats` : PostgREST ne sait
 * pas trier la table racine sur une colonne jointe. On ramène donc une fenêtre
 * raisonnable et on trie ici — sans quoi `limit(5)` renvoyait cinq matchs
 * arbitraires présentés comme « les derniers ».
 */
export async function getPlayerGames(id: string, count = 5) {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select(
      '*, match:matches!match_id(id, scheduled_at, home_team_id, away_team_id, home_score, away_score, home_team:teams!home_team_id(name,short_name), away_team:teams!away_team_id(name,short_name))',
    )
    .eq('player_id', id)
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as unknown as (PlayerMatchStat & { match?: Match })[];
  return rows
    .sort((a, b) => time(b.match?.scheduled_at) - time(a.match?.scheduled_at))
    .slice(0, count);
}

// Un match sans date programmée passe en fin de liste plutôt qu'en tête.
function time(iso?: string | null) {
  const n = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(n) ? -Infinity : n;
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

/**
 * Classement FIBA : 2 pts par victoire, 1 par défaite. À égalité de points, le
 * départage se fait sur le nombre de victoires puis sur le nom — sans ces
 * critères Postgres rendait les ex æquo dans un ordre arbitraire, qui changeait
 * d'un rafraîchissement à l'autre sous les yeux du supporter.
 */
export async function listStandings(competitionId?: string) {
  let q = supabase
    .from('team_standings')
    .select('*')
    .order('points', { ascending: false })
    .order('wins', { ascending: false })
    .order('played', { ascending: true })
    .order('team_name', { ascending: true });
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

// ---------------------------------------------------------------------------
// Fil de match (play-by-play)

export const EVENT_SELECT =
  '*, player:players(id, full_name, number), team:teams(id, name, short_name, color)';

export async function listMatchEvents(matchId: string) {
  const { data, error } = await supabase
    .from('match_events')
    .select(EVENT_SELECT)
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MatchEvent[];
}

export async function addMatchEvent(ev: {
  match_id: string;
  team_id?: string | null;
  player_id?: string | null;
  kind?: MatchEventKind;
  points?: number;
  quarter?: number | null;
  label?: string | null;
}) {
  const { error } = await supabase.from('match_events').insert(ev);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Galerie vidéos : tous les matchs disposant d'un résumé vidéo.

export async function listVideos() {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .not('video_url', 'is', null)
    .neq('video_url', '')
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

// ---------------------------------------------------------------------------
// Face-à-face : historique des confrontations entre deux équipes.

export async function getHeadToHead(teamA: string, teamB: string) {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('status', 'finished')
    .or(
      `and(home_team_id.eq.${teamA},away_team_id.eq.${teamB}),and(home_team_id.eq.${teamB},away_team_id.eq.${teamA})`,
    )
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

// ---------------------------------------------------------------------------
// Fan zone : vote MVP, pronostics, sondages.
//
// Les pourcentages sont lus depuis des vues d'agrégats (mvp_results,
// prediction_results, poll_results) : pas de plafond à 1000 lignes et aucune
// donnée personnelle exposée. Le vote de l'utilisateur est récupéré à part
// (les lignes brutes ne sont lisibles que par leur auteur, cf. RLS).

export async function listMvpResults(matchId: string) {
  const { data, error } = await supabase.rpc('mvp_results', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? []) as { player_id: string; votes: number }[];
}

export async function getMyMvpVote(matchId: string, userId: string) {
  const { data, error } = await supabase
    .from('mvp_votes')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Pick<MvpVote, 'player_id'> | null)?.player_id ?? null;
}

export async function voteMvp(matchId: string, userId: string, playerId: string) {
  const { error } = await supabase
    .from('mvp_votes')
    .upsert({ match_id: matchId, user_id: userId, player_id: playerId }, { onConflict: 'match_id,user_id' });
  if (error) throw error;
}

export async function listPredictionResults(matchId: string) {
  const { data, error } = await supabase.rpc('prediction_results', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? []) as { team_id: string; votes: number }[];
}

export async function getMyPrediction(matchId: string, userId: string) {
  const { data, error } = await supabase
    .from('predictions')
    .select('team_id')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Pick<Prediction, 'team_id'> | null)?.team_id ?? null;
}

export async function votePrediction(matchId: string, userId: string, teamId: string) {
  const { error } = await supabase
    .from('predictions')
    .upsert({ match_id: matchId, user_id: userId, team_id: teamId }, { onConflict: 'match_id,user_id' });
  if (error) throw error;
}

export async function listPolls() {
  const { data, error } = await supabase
    .from('polls')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Poll[];
}

export async function listPollResults(pollId: string) {
  const { data, error } = await supabase.rpc('poll_results', { p_poll_id: pollId });
  if (error) throw error;
  return (data ?? []) as { option_index: number; votes: number }[];
}

export async function getMyPollVote(pollId: string, userId: string) {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('option_index')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Pick<PollVote, 'option_index'> | null)?.option_index ?? null;
}

export async function votePoll(pollId: string, userId: string, optionIndex: number) {
  const { error } = await supabase
    .from('poll_votes')
    .upsert({ poll_id: pollId, user_id: userId, option_index: optionIndex }, { onConflict: 'poll_id,user_id' });
  if (error) throw error;
}

export async function createPoll(question: string, options: string[]) {
  const { error } = await supabase.from('polls').insert({ question, options });
  if (error) throw error;
}

export async function setPollActive(id: string, isActive: boolean) {
  const { error } = await supabase.from('polls').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deletePoll(id: string) {
  const { error } = await supabase.from('polls').delete().eq('id', id);
  if (error) throw error;
}
