// =========================================================================
// FGBB — Application web. Se connecte au MÊME backend Supabase que l'app mobile
// (mêmes tables, même authentification), afin qu'un compte créé ici fonctionne
// aussi dans l'application. Lecture publique des données sportives (RLS).
//
// La clé ci-dessous est la clé « publishable » (anon) : publique par conception,
// exactement comme dans l'app mobile. Ce sont les politiques RLS de Supabase qui
// protègent les données, pas le secret de cette clé.
// =========================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zufwxewrbngddltgglad.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3CBmkQn2zMYQP0nKnrpTfw_JpvCoeEK';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

const TZ = 'Africa/Conakry'; // Guinée = GMT

// --------------------------------------------------------------- état
let session = null;
let profile = null;
let currentRoute = 'accueil';
let lastListRoute = 'accueil'; // onglet d'où l'on ouvre une fiche match (pour le retour)
let viewRendered = false;
let liveTimer = null;
let detailTimer = null;
let teamsPromise = null;
let myClubsCache = null; // clubs délégués au compte courant (null = pas encore chargé)

// --------------------------------------------------------------- helpers DOM
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}
// hex (#rrggbb) → rgba(...) ; repli sur l'accent de la marque si la couleur est absente/invalide.
function hexA(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(59, 214, 27, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function initials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}
function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return ''; }
}
function fmtDate(iso) {
  if (!iso) return 'À programmer';
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
  } catch { return ''; }
}
function dayKeyTZ(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
// « Aujourd'hui » / « Demain » pour un match proche, sinon la date courte.
function relativeDayLabel(iso) {
  if (!iso) return 'À programmer';
  try {
    const d = new Date(iso), now = new Date();
    const kd = dayKeyTZ(d);
    if (kd === dayKeyTZ(now)) return "Aujourd'hui";
    if (kd === dayKeyTZ(new Date(now.getTime() + 86400000))) return 'Demain';
    return fmtDate(iso);
  } catch { return fmtDate(iso); }
}
function logoHtml(team, cls = 'mlogo') {
  const bg = team?.color || 'var(--teal)';
  if (team?.logo_url) {
    return `<span class="${cls}" style="background:${esc(bg)}"><img src="${esc(team.logo_url)}" alt="" loading="lazy"></span>`;
  }
  const label = team?.short_name || initials(team?.name);
  return `<span class="${cls}" style="background:${esc(bg)}">${esc(label)}</span>`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
async function safe(promise, fallback) {
  try { return await promise; } catch (e) { console.error('[FGBB]', e); return fallback; }
}

// --------------------------------------------------------------- requêtes
const MATCH_SELECT =
  '*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*), competition:competitions(*)';

async function listMatches(status) {
  let q = sb.from('matches').select(MATCH_SELECT).order('scheduled_at', { ascending: true });
  if (status) q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
  const { data, error } = await q.limit(400);
  if (error) throw error;
  return data ?? [];
}
async function listStandings(competitionId) {
  let q = sb
    .from('team_standings')
    .select('*')
    .order('points', { ascending: false })
    .order('wins', { ascending: false })
    .order('played', { ascending: true })
    .order('team_name', { ascending: true });
  if (competitionId) q = q.eq('competition_id', competitionId);
  // Points marqués/encaissés et différentiel vivent dans team_season_stats :
  // on les fusionne par équipe pour un classement complet (façon affiche D1).
  let sq = sb.from('team_season_stats').select('team_id, pts_for, pts_against, diff');
  if (competitionId) sq = sq.eq('competition_id', competitionId);
  const [main, stats] = await Promise.all([q, sq]);
  if (main.error) throw main.error;
  const byTeam = {};
  (stats.data ?? []).forEach((s) => { byTeam[s.team_id] = s; });
  return (main.data ?? []).map((r) => ({ ...r, ...(byTeam[r.team_id] || {}) }));
}
// Classement par poule (vue poule_standings, migration 0029).
async function listPouleStandings(competitionId) {
  let q = sb
    .from('poule_standings')
    .select('*')
    .order('poule', { ascending: true, nullsFirst: true })
    .order('points', { ascending: false })
    .order('wins', { ascending: false })
    .order('diff', { ascending: false })
    .order('team_name', { ascending: true });
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
// Affectation des équipes aux poules (admin).
async function listCompetitionTeams(competitionId) {
  const { data, error } = await sb
    .from('competition_teams')
    .select('*, team:teams(id, name, short_name, color, logo_url)')
    .eq('competition_id', competitionId);
  if (error) throw error;
  return data ?? [];
}
async function saveCompetitionTeam(competitionId, teamId, poule, seed) {
  const { error } = await sb
    .from('competition_teams')
    .upsert({ competition_id: competitionId, team_id: teamId, poule: poule || null, seed: seed ?? null }, { onConflict: 'competition_id,team_id' });
  if (error) throw error;
}
async function removeCompetitionTeam(competitionId, teamId) {
  const { error } = await sb.from('competition_teams').delete().eq('competition_id', competitionId).eq('team_id', teamId);
  if (error) throw error;
}
// Réseaux sociaux (admin) — écriture.
async function updateTeam(id, patch) {
  const { error } = await sb.from('teams').update(patch).eq('id', id);
  if (error) throw error;
}
async function updatePlayer(id, patch) {
  const { error } = await sb.from('players').update(patch).eq('id', id);
  if (error) throw error;
}
// CRUD admin — clubs, joueurs, compétitions (écriture).
async function createTeam(patch) {
  const { data, error } = await sb.from('teams').insert(patch).select('id').single();
  if (error) throw error;
  return data;
}
async function deleteTeam(id) {
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) throw error;
}
async function createPlayer(patch) {
  const { data, error } = await sb.from('players').insert(patch).select('id').single();
  if (error) throw error;
  return data;
}
async function deletePlayer(id) {
  const { error } = await sb.from('players').delete().eq('id', id);
  if (error) throw error;
}
async function listAdminPlayers() {
  const { data, error } = await sb.from('players').select('*, team:teams(id, name)').order('full_name');
  if (error) throw error;
  return data ?? [];
}
async function createCompetition(patch) {
  const { data, error } = await sb.from('competitions').insert(patch).select('id').single();
  if (error) throw error;
  return data;
}
async function updateCompetition(id, patch) {
  const { error } = await sb.from('competitions').update(patch).eq('id', id);
  if (error) throw error;
}
async function deleteCompetition(id) {
  const { error } = await sb.from('competitions').delete().eq('id', id);
  if (error) throw error;
}
// Upload d'une image vers le bucket Storage « media » (public en lecture, écriture admin).
async function uploadImage(file, folder) {
  const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
async function saveFederationSocials(patch) {
  const current = await getFederationInfo();
  const value = { ...current, ...patch };
  Object.keys(value).forEach((k) => { if (typeof value[k] === 'string' && !value[k].trim()) delete value[k]; });
  const { error } = await sb.from('settings').upsert({ key: 'federation', value }, { onConflict: 'key' });
  if (error) throw error;
}
// Playoffs (matches.phase = 'playoff', migration 0029).
const PLAYOFF_ROUNDS = [
  { key: 'quart', label: 'Quarts de finale' },
  { key: 'demi', label: 'Demi-finales' },
  { key: 'petite_finale', label: '3e place' },
  { key: 'finale', label: 'Finale' },
];
function playoffRoundLabel(k) { return PLAYOFF_ROUNDS.find((r) => r.key === k)?.label || 'Playoff'; }
async function listPlayoffMatches(competitionId) {
  let q = sb.from('matches').select(MATCH_SELECT).eq('phase', 'playoff').order('scheduled_at', { ascending: true });
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
async function createPlayoffMatch(m) {
  const { error } = await sb.from('matches').insert({ ...m, phase: 'playoff', status: 'scheduled' });
  if (error) throw error;
}
async function deleteMatch(id) {
  const { error } = await sb.from('matches').delete().eq('id', id);
  if (error) throw error;
}
// Matchs de championnat (phase 'regular') — programmation & résultats (admin).
async function listAdminMatches(competitionId) {
  let q = sb.from('matches').select(MATCH_SELECT).or('phase.eq.regular,phase.is.null').order('scheduled_at', { ascending: false, nullsFirst: false });
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
async function scheduleMatch(m) {
  const { error } = await sb.from('matches').insert({ ...m, phase: 'regular', status: 'scheduled' });
  if (error) throw error;
}
async function updateMatch(id, patch) {
  const { error } = await sb.from('matches').update(patch).eq('id', id);
  if (error) throw error;
}
async function listNews() {
  const { data, error } = await sb.from('news').select('*').order('published_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function listCompetitions() {
  const { data, error } = await sb.from('competitions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function listLeadersBy(col) {
  const { data, error } = await sb
    .from('player_season_stats')
    .select('*')
    .gt('games', 0)
    .order(col, { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
async function getMatch(id) {
  const { data, error } = await sb.from('matches').select(MATCH_SELECT).eq('id', id).single();
  if (error) throw error;
  return data;
}
async function getMatchStats(matchId) {
  const { data, error } = await sb
    .from('player_match_stats')
    .select('*, player:players(*)')
    .eq('match_id', matchId)
    .order('points', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
const EVENT_SELECT = '*, player:players(id, full_name, number), team:teams(id, name, short_name, color)';
async function listMatchEvents(matchId) {
  const { data, error } = await sb
    .from('match_events')
    .select(EVENT_SELECT)
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// -- joueurs
async function getPlayer(id) {
  const { data, error } = await sb.from('players').select('*, team:teams(*)').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function getPlayerSeason(id) {
  const { data } = await sb.from('player_season_stats').select('*').eq('player_id', id).maybeSingle();
  return data ?? null;
}
function tOf(iso) { const n = iso ? Date.parse(iso) : NaN; return Number.isNaN(n) ? -Infinity : n; }
async function getPlayerGames(id, count = 8) {
  const { data, error } = await sb
    .from('player_match_stats')
    .select('*, match:matches!match_id(id, scheduled_at, home_team_id, away_team_id, home_score, away_score, home_team:teams!home_team_id(name,short_name), away_team:teams!away_team_id(name,short_name))')
    .eq('player_id', id)
    .limit(200);
  if (error) throw error;
  return (data ?? []).sort((a, b) => tOf(b.match?.scheduled_at) - tOf(a.match?.scheduled_at)).slice(0, count);
}

// -- clubs
async function getTeam(id) {
  const { data, error } = await sb.from('teams').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function getTeamPlayers(teamId) {
  const { data, error } = await sb.from('players').select('*').eq('team_id', teamId).order('number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
async function getTeamStanding(teamId) {
  const { data } = await sb.from('team_standings').select('*').eq('team_id', teamId).maybeSingle();
  return data ?? null;
}
async function getTeamMatches(teamId) {
  const { data, error } = await sb.from('matches').select(MATCH_SELECT).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`).order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function listTeams() {
  const { data, error } = await sb.from('teams').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

// -- contenus
async function getNewsItem(id) {
  const { data, error } = await sb.from('news').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function listVideos() {
  const { data, error } = await sb.from('matches').select(MATCH_SELECT).not('video_url', 'is', null).neq('video_url', '').order('scheduled_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// -- fan zone (sondages)
async function listPolls() {
  const { data, error } = await sb.from('polls').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function pollResults(pollId) {
  const { data, error } = await sb.rpc('poll_results', { p_poll_id: pollId });
  if (error) throw error;
  return data ?? [];
}
async function myPollVote(pollId, userId) {
  const { data } = await sb.from('poll_votes').select('option_index').eq('poll_id', pollId).eq('user_id', userId).maybeSingle();
  return data ? data.option_index : null;
}
async function votePoll(pollId, userId, optionIndex) {
  const { error } = await sb.from('poll_votes').upsert({ poll_id: pollId, user_id: userId, option_index: optionIndex }, { onConflict: 'poll_id,user_id' });
  if (error) throw error;
}

// -- face-à-face
async function getHeadToHead(teamA, teamB) {
  const { data, error } = await sb
    .from('matches')
    .select(MATCH_SELECT)
    .eq('status', 'finished')
    .or(`and(home_team_id.eq.${teamA},away_team_id.eq.${teamB}),and(home_team_id.eq.${teamB},away_team_id.eq.${teamA})`)
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// -- vote MVP
async function mvpResults(matchId) {
  const { data, error } = await sb.rpc('mvp_results', { p_match_id: matchId });
  if (error) throw error;
  return data ?? [];
}
async function myMvpVote(matchId, userId) {
  const { data } = await sb.from('mvp_votes').select('player_id').eq('match_id', matchId).eq('user_id', userId).maybeSingle();
  return data ? data.player_id : null;
}
async function voteMvp(matchId, userId, playerId) {
  const { error } = await sb.from('mvp_votes').upsert({ match_id: matchId, user_id: userId, player_id: playerId }, { onConflict: 'match_id,user_id' });
  if (error) throw error;
}

// -- pronostics
async function predictionResults(matchId) {
  const { data, error } = await sb.rpc('prediction_results', { p_match_id: matchId });
  if (error) throw error;
  return data ?? [];
}
async function myPrediction(matchId, userId) {
  const { data } = await sb.from('predictions').select('team_id').eq('match_id', matchId).eq('user_id', userId).maybeSingle();
  return data ? data.team_id : null;
}
async function votePrediction(matchId, userId, teamId) {
  const { error } = await sb.from('predictions').upsert({ match_id: matchId, user_id: userId, team_id: teamId }, { onConflict: 'match_id,user_id' });
  if (error) throw error;
}

// -- favoris (clubs) & abonnements (joueurs)
async function isFavoriteTeam(userId, teamId) {
  const { data } = await sb.from('favorites').select('team_id').eq('user_id', userId).eq('team_id', teamId).maybeSingle();
  return !!data;
}
async function addFavorite(userId, teamId) {
  const { error } = await sb.from('favorites').insert({ user_id: userId, team_id: teamId });
  if (error) throw error;
}
async function removeFavorite(userId, teamId) {
  const { error } = await sb.from('favorites').delete().eq('user_id', userId).eq('team_id', teamId);
  if (error) throw error;
}
async function listFavoriteTeams() {
  const { data, error } = await sb.from('favorites').select('team:teams(*)');
  if (error) throw error;
  return (data ?? []).map((r) => r.team).filter(Boolean);
}
async function isFollowingPlayer(userId, playerId) {
  const { data } = await sb.from('player_follows').select('player_id').eq('user_id', userId).eq('player_id', playerId).maybeSingle();
  return !!data;
}
async function followPlayer(userId, playerId) {
  const { error } = await sb.from('player_follows').insert({ user_id: userId, player_id: playerId });
  if (error) throw error;
}
async function unfollowPlayer(userId, playerId) {
  const { error } = await sb.from('player_follows').delete().eq('user_id', userId).eq('player_id', playerId);
  if (error) throw error;
}
async function listFollowedPlayers() {
  const { data, error } = await sb.from('player_follows').select('created_at, player:players(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.player).filter(Boolean);
}

// -- recherche
async function searchAll(term) {
  const like = `%${term}%`;
  const [players, teams, news] = await Promise.all([
    sb.from('players').select('id, full_name, team_id').ilike('full_name', like).limit(12).then((r) => r.data ?? []),
    sb.from('teams').select('id, name, short_name, color, logo_url').ilike('name', like).limit(12).then((r) => r.data ?? []),
    sb.from('news').select('id, title, published_at').ilike('title', like).limit(12).then((r) => r.data ?? []),
  ]);
  return { players, teams, news };
}

// -- institutionnel & comparateur
async function getFederationInfo() {
  const { data, error } = await sb.from('settings').select('value').eq('key', 'federation').maybeSingle();
  if (error) throw error;
  return data?.value ?? {};
}
async function listSponsors() {
  const { data, error } = await sb.from('sponsors').select('*').eq('is_active', true).order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function listPlayersLite() {
  const { data, error } = await sb.from('players').select('id, full_name').order('full_name');
  if (error) throw error;
  return data ?? [];
}
function externalUrl(raw) {
  const v = (raw ?? '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : 'https://' + v;
}
function waLink(v) {
  const s = String(v).trim();
  return /^https?:/i.test(s) ? s : 'https://wa.me/' + s.replace(/[^\d]/g, '');
}
const SOCIAL_ICONS = {
  facebook: '<path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0022 12z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.6" cy="6.4" r="1.3"/>',
  tiktok: '<path d="M16.5 3c.3 2.2 1.8 3.9 4 4.2v3c-1.5 0-2.9-.5-4-1.3v6.1a5.5 5.5 0 11-5.5-5.5c.3 0 .6 0 .9.1v3.1a2.5 2.5 0 102 2.4V3z"/>',
  youtube: '<path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 00-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4A2.5 2.5 0 001.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 001.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 001.7-1.7C23 15.2 23 12 23 12zM9.8 15.3V8.7l5.7 3.3z"/>',
  x: '<path d="M4 3l7 8.6L4.4 21H7l5-5.9L17 21h3l-7.4-9L19.6 3H17l-4.6 5.4L8.7 3z"/>',
  whatsapp: '<path d="M12 2a10 10 0 00-8.6 15L2 22l5.1-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 01-1.9-1.2 7 7 0 01-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4H7c-.2 0-.4.1-.6.3a2.6 2.6 0 00-.8 2 4.6 4.6 0 001 2.4 10.4 10.4 0 004 3.5c1.4.6 2 .6 2.7.5a2.3 2.3 0 001.5-1c.2-.5.2-1 .1-1z"/>',
  website: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3a15 15 0 010 18" fill="none" stroke="currentColor" stroke-width="2"/>',
};
function socialLinksHtml(obj, defs) {
  const items = defs.map((d) => {
    const v = obj?.[d.key];
    if (!v || !String(v).trim()) return '';
    const href = d.key === 'whatsapp' ? waLink(v) : externalUrl(v);
    return `<a class="social-ic" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${d.label}"><svg viewBox="0 0 24 24" fill="currentColor">${SOCIAL_ICONS[d.icon || d.key]}</svg></a>`;
  }).filter(Boolean);
  return items.length ? `<div class="socials-row">${items.join('')}</div>` : '';
}
const FED_SOCIALS = [{ key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' }, { key: 'tiktok', label: 'TikTok' }, { key: 'youtube', label: 'YouTube' }, { key: 'x', label: 'X' }, { key: 'whatsapp', label: 'WhatsApp' }];
const TEAM_SOCIALS = [{ key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' }, { key: 'tiktok', label: 'TikTok' }, { key: 'youtube', label: 'YouTube' }, { key: 'x_url', label: 'X', icon: 'x' }, { key: 'website', label: 'Site web', icon: 'website' }];
const PLAYER_SOCIALS = [{ key: 'instagram', label: 'Instagram' }, { key: 'tiktok', label: 'TikTok' }, { key: 'x_url', label: 'X', icon: 'x' }];

// -- palmarès
const AWARD_LABELS = { joueur_du_mois: 'Joueur du mois', mvp_saison: 'MVP de la saison', meilleur_cinq: 'Meilleur cinq', autre: 'Distinction' };
async function listAwards() {
  const { data, error } = await sb.from('awards').select('*, player:players(*), team:teams(*)').order('awarded_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
// -- arbitres
const REFEREE_LEVEL_LABELS = { regional: 'Régional', national: 'National', fiba: 'FIBA' };
async function listReferees() {
  const { data, error } = await sb.from('referees').select('*').eq('is_active', true).order('full_name');
  if (error) throw error;
  return data ?? [];
}
// -- discipline
const SANCTION_LABELS = { avertissement: 'Avertissement', suspension: 'Suspension', amende: 'Amende', exclusion: 'Exclusion' };
const SANCTION_STATUS_LABELS = { active: 'En cours', served: 'Purgée', cancelled: 'Annulée' };
const SANCTION_SELECT = '*, player:players(id, full_name, photo_url, team_id), team:teams(id, name, short_name, color, logo_url)';
async function listSanctions() {
  const { data, error } = await sb.from('sanctions').select(SANCTION_SELECT).order('decided_at', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
function formatGnf(amount) {
  const digits = Math.round(Math.abs(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (amount < 0 ? '-' : '') + digits + ' GNF';
}
// -- médias
const MEDIA_KINDS = [{ id: 'interview', label: 'Interviews', one: 'Interview' }, { id: 'podcast', label: 'Podcasts', one: 'Podcast' }, { id: 'reportage', label: 'Reportages', one: 'Reportage' }, { id: 'video', label: 'Vidéos', one: 'Vidéo' }];
function mediaOne(k) { return MEDIA_KINDS.find((x) => x.id === k)?.one || 'Média'; }
async function listMedia(kind) {
  let q = sb.from('media_items').select('*').order('published_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
// -- agenda
const EVENT_CAT_LABELS = { federation: 'Fédération', competition: 'Compétition', formation: 'Formation', ceremonie: 'Cérémonie', autre: 'Autre' };
async function listEvents() {
  const { data, error } = await sb.from('events').select('*').order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
// -- classement des supporters
async function getLeaderboard(limit = 50) {
  const { data, error } = await sb.rpc('fan_leaderboard', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
async function getMyFanStats() {
  const { data, error } = await sb.rpc('my_fan_stats');
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}
// -- quiz
async function listQuizzes() {
  const { data, error } = await sb.from('quizzes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function getQuiz(id) {
  const { data, error } = await sb.from('quizzes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function listQuizQuestionsPublic(quizId) {
  const { data, error } = await sb.rpc('quiz_questions_public', { p_quiz_id: quizId });
  if (error) throw error;
  return data ?? [];
}
async function submitQuiz(quizId, answers) {
  const { data, error } = await sb.rpc('submit_quiz', { p_quiz_id: quizId, p_answers: answers });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}
async function listMyAttempts() {
  const { data, error } = await sb.from('quiz_attempts').select('*');
  if (error) throw error;
  return data ?? [];
}

// -- commentaires (match & actus)
async function listComments(targetType, targetId) {
  const { data, error } = await sb.from('comments').select('*').eq('target_type', targetType).eq('target_id', targetId).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}
async function addComment(targetType, targetId, userId, body) {
  const { data, error } = await sb.from('comments').insert({ target_type: targetType, target_id: targetId, user_id: userId, body }).select('*').single();
  if (error) throw error;
  return data;
}
// -- chat en direct
async function listChatMessages(matchId, limit = 60) {
  const { data, error } = await sb.from('chat_messages').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
async function sendChatMessage(matchId, userId, body) {
  const { error } = await sb.from('chat_messages').insert({ match_id: matchId, user_id: userId, body: body.trim() });
  if (error) throw error;
}
// -- photos
async function listPhotos({ matchId, album } = {}) {
  let q = sb.from('photos').select('*');
  if (matchId) q = q.eq('match_id', matchId);
  if (album) q = q.eq('album', album);
  const { data, error } = await q.order('position').order('created_at');
  if (error) throw error;
  return data ?? [];
}
async function listAlbums() {
  const { data, error } = await sb.from('photos').select('id, match_id, album, url, created_at').order('position').order('created_at');
  if (error) throw error;
  const groups = new Map();
  for (const p of data ?? []) {
    if (!p.match_id && !p.album) continue;
    const key = p.match_id ? 'match:' + p.match_id : 'album:' + p.album;
    const found = groups.get(key);
    if (found) { found.count++; if (p.created_at > found.lastAt) found.lastAt = p.created_at; continue; }
    groups.set(key, { key, kind: p.match_id ? 'match' : 'album', album: p.match_id ? null : p.album, matchId: p.match_id, match: null, cover: p.url, count: 1, lastAt: p.created_at });
  }
  const list = [...groups.values()];
  const matchIds = list.map((g) => g.matchId).filter(Boolean);
  if (matchIds.length) {
    const { data: matches } = await sb.from('matches').select(MATCH_SELECT).in('id', matchIds);
    const byId = new Map((matches ?? []).map((m) => [m.id, m]));
    list.forEach((g) => { if (g.matchId) g.match = byId.get(g.matchId) ?? null; });
  }
  list.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return list;
}
// -- officiels d'un match
const OFFICIAL_ROLE_LABELS = { principal: 'Arbitre principal', assistant: 'Arbitre assistant', table: 'Table de marque', commissaire: 'Commissaire' };
async function listMatchOfficials(matchId) {
  const { data, error } = await sb.from('match_officials').select('*, referee:referees(*)').eq('match_id', matchId);
  if (error) throw error;
  const rank = (r) => ['principal', 'assistant', 'table', 'commissaire'].indexOf(r);
  return (data ?? []).sort((a, b) => rank(a.role) - rank(b.role));
}
function errMsg(e) { return e && typeof e === 'object' && 'message' in e && e.message ? e.message : 'Action impossible'; }
function timeAgoShort(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60); if (m < 60) return `il y a ${m} min`;
  const hr = Math.floor(m / 60); if (hr < 24) return `il y a ${hr} h`;
  const d = Math.floor(hr / 24); if (d < 31) return `il y a ${d} j`;
  return fmtDate(iso);
}
function fetchTeamsMap() {
  if (!teamsPromise) {
    teamsPromise = sb
      .from('teams')
      .select('*')
      .then(({ data }) => {
        const m = {};
        (data ?? []).forEach((t) => (m[t.id] = t));
        return m;
      })
      .catch(() => ({}));
  }
  return teamsPromise;
}

// --------------------------------------------------------------- gabarits
function loadingHtml() {
  return `<div class="skeleton" aria-hidden="true">
    <div class="sk-line w40"></div>
    <div class="sk-block"></div>
    <div class="sk-block"></div>
    <div class="sk-block"></div>
  </div>`;
}
function emptyHtml(title, sub, icon = 'inbox') {
  const icons = {
    inbox: '<path d="M3 12h5l2 3h4l2-3h5M3 12l3-8h12l3 8M3 12v6a2 2 0 002 2h14a2 2 0 002-2v-6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 010 18M3 12h18M5 6c4 3 10 3 14 0M5 18c4-3 10-3 14 0"/>',
    news: '<path d="M4 5h16v14H4zM4 9h16M9 5v14"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>',
  };
  return `<div class="empty-state">
    <div class="ei"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[icon] || icons.inbox}</svg></div>
    <h3>${esc(title)}</h3><p>${esc(sub)}</p></div>`;
}
function errorHtml() {
  return `<div class="error-banner">Impossible de charger les données pour le moment. Vérifiez votre connexion internet et réessayez.</div>`;
}

const CLOCK_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>';
const PIN_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
function matchCardHtml(m) {
  const home = m.home_team, away = m.away_team;
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const sched = !live && !done;
  const homeWin = done && m.home_score > m.away_score;
  const awayWin = done && m.away_score > m.home_score;
  const comp = m.competition?.name || 'Match';
  const roundTxt = m.round ? ` · J${m.round}` : '';
  const metaRight = sched ? relativeDayLabel(m.scheduled_at) : fmtDate(m.scheduled_at);

  let center;
  if (sched) {
    center = `<div class="mnext"><span class="mvs">VS</span><span class="mkick">${CLOCK_ICO}${fmtTime(m.scheduled_at) || 'à venir'}</span></div>`;
  } else {
    center = `<div class="mscore"><span class="${awayWin ? 'loser' : ''}">${m.home_score ?? 0}</span><span class="sep">:</span><span class="${homeWin ? 'loser' : ''}">${m.away_score ?? 0}</span></div>`;
  }

  let status = '';
  if (live) status = `<span class="pill live">Q${m.current_quarter || 1} · En direct</span>`;
  else if (done) status = `<span class="pill done">Terminé</span>`;
  const venue = m.venue ? `<span class="mvenue">${PIN_ICO}${esc(m.venue)}</span>` : '';
  const statusRow = (status || venue) ? `<div class="mstatus">${status}${venue}</div>` : '';

  return `<a class="match${sched ? ' is-next' : ''}" href="#match/${m.id}">
    <div class="match-meta"><span>${esc(comp)}${roundTxt}</span><span>${esc(metaRight)}</span></div>
    <div class="match-body">
      <div class="mteam">${logoHtml(home)}<span class="mn">${esc(home?.name || 'Équipe')}</span></div>
      ${center}
      <div class="mteam away">${logoHtml(away)}<span class="mn">${esc(away?.name || 'Équipe')}</span></div>
    </div>
    ${statusRow}
  </a>`;
}

function standingsHtml(rows, opts = {}) {
  if (!rows.length) return emptyHtml('Classement à venir', 'Le classement apparaîtra dès les premiers matchs joués.', 'trophy');
  const full = !!opts.full;
  const n = rows.length;
  const body = rows.map((r, i) => {
    const team = { name: r.team_name, short_name: r.short_name, color: r.color };
    const cls = [];
    if (i === 0) cls.push('top');
    if (opts.qualify && i < opts.qualify) cls.push('qualif');
    if (full && i === n - 1 && n > 2) cls.push('relegation');
    const diff = r.diff != null ? r.diff : (r.pts_for != null && r.pts_against != null ? r.pts_for - r.pts_against : null);
    const diffTxt = diff == null ? '—' : diff > 0 ? '+' + diff : String(diff);
    const extra = full
      ? `<td class="col-pf">${r.pts_for ?? '—'}</td><td class="col-pa">${r.pts_against ?? '—'}</td><td class="diff ${diff >= 0 ? 'pos' : 'neg'}">${diffTxt}</td>`
      : '';
    return `<tr class="${cls.join(' ')}">
      <td class="rk">${i + 1}</td>
      <td class="team"><div class="team-cell">${logoHtml(team)}<a href="#team/${r.team_id}">${esc(r.team_name)}</a></div></td>
      <td class="pts">${r.points}</td>
      <td class="col-mj">${r.played}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      ${extra}
    </tr>`;
  }).join('');
  const head = `<th class="rk">#</th><th class="team">Club</th><th class="pts">Pts</th><th class="col-mj">MJ</th><th>V</th><th>D</th>${full ? '<th class="col-pf">Pts+</th><th class="col-pa">Pts−</th><th>Diff</th>' : ''}`;
  return `<div class="std-scroll"><table class="standings"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function newsCardHtml(n) {
  const cover = n.cover_url
    ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">`
    : `<span class="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h16v14H4zM4 9h16M9 5v14"/></svg></span>`;
  const excerpt = n.body ? esc(n.body).slice(0, 150) + (n.body.length > 150 ? '…' : '') : '';
  const d = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(n.published_at));
  return `<a class="news-card" href="#news/${n.id}">
    <div class="news-cover">${cover}</div>
    <div class="news-body">
      ${n.category ? `<span class="news-cat">${esc(n.category)}</span>` : ''}
      <h3>${esc(n.title)}</h3>
      ${excerpt ? `<p class="excerpt">${excerpt}</p>` : '<p class="excerpt"></p>'}
      <span class="date">${d}</span>
    </div>
  </a>`;
}

function leaderRowHtml(p, i, unit, teamsMap) {
  const team = p.team_id ? teamsMap[p.team_id] : null;
  const val = Number(p[unit.col] ?? 0).toFixed(1);
  return `<a class="leader" href="#player/${p.player_id}">
    <span class="lrank">${i + 1}</span>
    <span class="lava">${initials(p.full_name)}</span>
    <span class="linfo"><span class="ln">${esc(p.full_name)}</span><span class="lt">${esc(team?.name || '—')} · ${p.games} match${p.games > 1 ? 's' : ''}</span></span>
    <span class="lval"><b>${val}</b><span>${unit.label}</span></span>
  </a>`;
}

// --------------------------------------------------------------- vues
async function renderAccueil() {
  view.innerHTML = loadingHtml();
  const [matches, standings, news] = await Promise.all([
    safe(listMatches(), []),
    safe(listStandings(), []),
    safe(listNews(), []),
  ]);

  const live = matches.filter((m) => m.status === 'live');
  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const finished = matches.filter((m) => m.status === 'finished');
  const featured = live[0] || upcoming[0] || finished[finished.length - 1] || null;
  const hasLive = live.length > 0;

  if (!matches.length && !standings.length && !news.length) {
    view.innerHTML =
      `<h1 class="view-title">Bienvenue sur FGBB</h1>
       <p class="view-sub">Le championnat démarre bientôt. Les matchs, classements et actualités s'afficheront ici dès leur publication par la fédération.</p>` +
      emptyHtml('Saison à venir', 'Créez votre compte supporter dès maintenant pour être prêt au coup d\'envoi.', 'ball');
    return;
  }

  let html = `<h1 class="view-title">Bonjour${profile?.full_name ? ' ' + esc(profile.full_name.split(' ')[0]) : ''}</h1>
    <p class="view-sub">Voici l'essentiel du basket guinéen aujourd'hui.</p>`;

  if (featured) {
    const f = featured;
    const isLive = f.status === 'live';
    const isDone = f.status === 'finished';
    const centre = isLive || isDone
      ? `<div class="fscore">${f.home_score ?? 0} <span class="vs">:</span> ${f.away_score ?? 0}</div>`
      : `<div class="fscore"><span class="vs">VS</span></div>`;
    const label = isLive ? `<span class="pill live">En direct</span>` : isDone ? 'Terminé' : `${fmtDate(f.scheduled_at)} · ${fmtTime(f.scheduled_at)}`;
    html += `<a class="featured" href="#match/${f.id}">
      <div class="fh">Match à la une${f.competition?.name ? ' · ' + esc(f.competition.name) : ''}</div>
      <div class="fbody">
        <div class="fteam">${logoHtml(f.home_team, 'mlogo')}<span class="fn">${esc(f.home_team?.name || '')}</span></div>
        ${centre}
        <div class="fteam">${logoHtml(f.away_team, 'mlogo')}<span class="fn">${esc(f.away_team?.name || '')}</span></div>
      </div>
      <div class="fmeta">${label}</div>
    </a>`;
  }

  // Prochains / derniers matchs (max 4)
  const feedList = [...live, ...upcoming.slice(0, 3), ...finished.slice(-3).reverse()]
    .filter((m) => m !== featured)
    .slice(0, 4);
  if (feedList.length) {
    html += `<div class="block"><div class="block-head"><h2>Matchs</h2><button class="more" data-go="matchs">Tout voir →</button></div>${feedList.map(matchCardHtml).join('')}</div>`;
  }

  if (standings.length) {
    html += `<div class="block"><div class="block-head"><h2>Classement</h2><button class="more" data-go="classement">Tout voir →</button></div>${standingsHtml(standings.slice(0, 5))}</div>`;
  }

  if (news.length) {
    html += `<div class="block"><div class="block-head"><h2>Actualités</h2><button class="more" data-go="actus">Tout voir →</button></div><div class="news-grid">${news.slice(0, 3).map(newsCardHtml).join('')}</div></div>`;
  }

  view.innerHTML = html;
  view.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => (location.hash = b.dataset.go)));
  scheduleLiveRefresh(hasLive);
}

let matchFilter = 'all';
async function renderMatchs() {
  view.innerHTML =
    `<h1 class="view-title">Matchs</h1>
     <div class="segmented" id="matchSeg">
       ${[['all', 'Tous'], ['live', 'En direct'], ['scheduled', 'À venir'], ['finished', 'Terminés']]
        .map(([k, l]) => `<button class="seg ${matchFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`)
        .join('')}
     </div><div id="matchList">${loadingHtml()}</div>`;

  $('#matchSeg').querySelectorAll('.seg').forEach((b) =>
    b.addEventListener('click', () => { matchFilter = b.dataset.f; renderMatchs(); }),
  );

  const all = await safe(listMatches(), null);
  const listEl = $('#matchList');
  if (all === null) { listEl.innerHTML = errorHtml(); return; }

  let rows = all;
  if (matchFilter !== 'all') rows = all.filter((m) => m.status === matchFilter);
  else {
    const order = { live: 0, scheduled: 1, finished: 2 };
    rows = [...all].sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : 0;
      const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : 0;
      return a.status === 'finished' ? tb - ta : ta - tb;
    });
  }

  listEl.innerHTML = rows.length ? rows.map(matchCardHtml).join('') : emptyHtml('Aucun match', 'Aucun match dans cette catégorie pour le moment.', 'ball');
  scheduleLiveRefresh(all.some((m) => m.status === 'live'));
}

let compFilter = undefined; // undefined = pas encore choisi
async function renderClassement() {
  view.innerHTML = `<h1 class="view-title">Classement</h1><p class="view-sub">2 points par victoire, 1 par défaite (règles FIBA).</p>
    <div class="sub-links">
      <a class="sub-link" href="#records">${icoSvg('<circle cx="12" cy="8" r="5"/><path d="M8.2 12.5L7 22l5-3 5 3-1.2-9.5"/>')}Records</a>
      <a class="sub-link" href="#stats-equipes">${icoSvg('<path d="M18 20V10M12 20V4M6 20v-6"/>')}Stats équipes</a>
      <a class="sub-link" href="#stats-avancees">${icoSvg('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>')}Stats avancées</a>
    </div>
    <div id="clsFilter"></div><div id="clsBody">${loadingHtml()}</div>`;

  const comps = await safe(listCompetitions(), []);
  if (compFilter === undefined) compFilter = comps.length ? comps[0].id : null;

  if (comps.length) {
    const seg = [`<button class="seg ${compFilter === null ? 'active' : ''}" data-c="">Toutes</button>`]
      .concat(comps.map((c) => `<button class="seg ${compFilter === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`))
      .join('');
    const wrap = $('#clsFilter');
    wrap.className = 'segmented';
    wrap.innerHTML = seg;
    wrap.querySelectorAll('.seg').forEach((b) =>
      b.addEventListener('click', () => { compFilter = b.dataset.c || null; renderClassement(); }),
    );
  }

  // Classement par poule si des équipes y sont affectées ; sinon classement global.
  const pouleRows = await safe(listPouleStandings(compFilter || undefined), []);
  if (pouleRows.length) {
    const groups = {};
    pouleRows.forEach((r) => { const k = r.poule || 'Sans poule'; (groups[k] = groups[k] || []).push(r); });
    $('#clsBody').innerHTML = Object.keys(groups).sort().map((k) => {
      const g = groups[k];
      const isPoule = k !== 'Sans poule';
      const note = isPoule && g.length > 4 ? '<span class="poule-note">Top 4 → playoffs</span>' : '';
      return `<div class="poule-block"><div class="poule-head"><h2>${isPoule ? 'Poule ' + esc(k) : 'Classement'}</h2>${note}</div>${standingsHtml(g, { full: true, qualify: g.length > 4 ? 4 : 0 })}</div>`;
    }).join('');
  } else {
    const rows = await safe(listStandings(compFilter || undefined), null);
    $('#clsBody').innerHTML = rows === null ? errorHtml() : standingsHtml(rows, { full: true });
  }
}

async function renderActus() {
  view.innerHTML = `<h1 class="view-title">Actualités</h1><p class="view-sub">Le fil officiel de la fédération.</p><div id="newsBody">${loadingHtml()}</div>`;
  const news = await safe(listNews(), null);
  $('#newsBody').innerHTML =
    news === null ? errorHtml()
    : news.length ? `<div class="news-grid">${news.map(newsCardHtml).join('')}</div>`
    : emptyHtml('Pas encore d\'actualité', 'Les actualités de la fédération apparaîtront ici.', 'news');
}

const LEADER_CATS = [
  { col: 'ppg', label: 'pts', name: 'Points' },
  { col: 'rpg', label: 'reb', name: 'Rebonds' },
  { col: 'apg', label: 'pd', name: 'Passes' },
  { col: 'spg', label: 'int', name: 'Interceptions' },
  { col: 'bpg', label: 'ctr', name: 'Contres' },
];
let leaderCat = 'ppg';
async function renderLeaders() {
  view.innerHTML =
    `<h1 class="view-title">Leaders</h1><p class="view-sub">Les meilleures moyennes de la saison.</p>
     <div class="segmented" id="ldSeg">${LEADER_CATS.map((c) => `<button class="seg ${leaderCat === c.col ? 'active' : ''}" data-c="${c.col}">${c.name}</button>`).join('')}</div>
     <div id="ldBody">${loadingHtml()}</div>`;

  $('#ldSeg').querySelectorAll('.seg').forEach((b) =>
    b.addEventListener('click', () => { leaderCat = b.dataset.c; renderLeaders(); }),
  );

  const unit = LEADER_CATS.find((c) => c.col === leaderCat);
  const [rows, teamsMap] = await Promise.all([safe(listLeadersBy(leaderCat), null), fetchTeamsMap()]);
  $('#ldBody').innerHTML =
    rows === null ? errorHtml()
    : rows.length ? rows.map((p, i) => leaderRowHtml(p, i, unit, teamsMap)).join('')
    : emptyHtml('Pas encore de statistiques', 'Les leaders apparaîtront après les premiers matchs.', 'trophy');
}

// ------------------------------------------------------- fiche match (détail)
function backBtnHtml() {
  return `<button class="back-btn" id="backBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Retour</button>`;
}
function wireBack() {
  const b = $('#backBtn');
  if (b) b.addEventListener('click', () => { location.hash = lastListRoute; });
}
function eventText(ev) {
  if (ev.label) return ev.label;
  const who = ev.player?.full_name ? ` — ${ev.player.full_name}` : '';
  switch (ev.kind) {
    case 'points': return `Panier +${ev.points}${who}`;
    case 'foul': return `Faute${who}`;
    case 'timeout': return 'Temps mort';
    case 'quarter': return `Fin du quart-temps ${ev.quarter || ''}`.trim();
    case 'correction': return `Correction${who}`;
    default: return 'Info';
  }
}
function pbpRowHtml(ev) {
  const color = ev.team?.color || 'var(--teal)';
  return `<div class="pbp-row">
    <span class="pbp-q">${ev.quarter ? 'Q' + ev.quarter : '·'}</span>
    <span class="pbp-dot" style="background:${esc(color)}"></span>
    <span class="pbp-txt">${esc(eventText(ev))}</span>
  </div>`;
}
function boxTableHtml(team, rows) {
  if (!rows.length) {
    return `<div class="bx-team"><div class="bx-head">${logoHtml(team)}<b>${esc(team?.name || '')}</b></div><p class="bx-empty">Pas encore de statistiques.</p></div>`;
  }
  const body = rows.map((s) => {
    const p = s.player;
    return `<tr>
      <td class="bx-p"><span class="bx-num">${p?.number ?? ''}</span>${p?.id ? `<a class="bx-plink" href="#player/${p.id}">${esc(p.full_name)}</a>` : esc(p?.full_name || '—')}</td>
      <td class="bx-pts">${s.points}</td><td>${s.rebounds}</td><td>${s.assists}</td><td>${s.steals}</td><td>${s.blocks}</td><td class="hide-sm">${s.fouls}</td>
    </tr>`;
  }).join('');
  return `<div class="bx-team">
    <div class="bx-head">${logoHtml(team)}<b>${esc(team?.name || '')}</b></div>
    <div style="overflow-x:auto"><table class="bx">
      <thead><tr><th class="bx-p">Joueur</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Int</th><th>Ct</th><th class="hide-sm">Ft</th></tr></thead>
      <tbody>${body}</tbody></table></div>
  </div>`;
}

async function renderMatchDetail(id) {
  view.innerHTML = backBtnHtml() + loadingHtml();
  wireBack();
  window.scrollTo({ top: 0 });
  const [m, stats, events] = await Promise.all([
    safe(getMatch(id), null),
    safe(getMatchStats(id), []),
    safe(listMatchEvents(id), []),
  ]);
  if (!m) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }

  const live = m.status === 'live', done = m.status === 'finished';
  const scheduled = !live && !done;
  const homeWin = done && m.home_score > m.away_score;
  const awayWin = done && m.away_score > m.home_score;
  const scoreShown = live || done;

  let qs = '';
  if (Array.isArray(m.quarter_scores) && m.quarter_scores.length) {
    const head = m.quarter_scores.map((q) => `<th>Q${q.q}</th>`).join('');
    const hrow = m.quarter_scores.map((q) => `<td>${q.home}</td>`).join('');
    const arow = m.quarter_scores.map((q) => `<td>${q.away}</td>`).join('');
    qs = `<div style="overflow-x:auto"><table class="qscores">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>
        <tr><td class="qt-team">${esc(m.home_team?.short_name || m.home_team?.name || '')}</td>${hrow}</tr>
        <tr><td class="qt-team">${esc(m.away_team?.short_name || m.away_team?.name || '')}</td>${arow}</tr>
      </tbody></table></div>`;
  }

  // en-tête : compétition + journée seules (date/lieu passent dans la ligne d'infos,
  // même langage visuel que les cartes de la liste des matchs — jour relatif, pastille
  // horaire, icône de lieu).
  const compLine = [m.competition?.name, m.round ? 'Journée ' + m.round : null].filter(Boolean).join(' · ') || 'Match';
  let infoHtml;
  if (scheduled) {
    infoHtml = `<span class="md-kick">${CLOCK_ICO}<b>${esc(relativeDayLabel(m.scheduled_at))}</b>${fmtTime(m.scheduled_at) ? ' · ' + esc(fmtTime(m.scheduled_at)) : ''}</span>`;
  } else if (live) {
    infoHtml = `<span class="pill live">Q${m.current_quarter || 1} · En direct</span>`;
  } else {
    infoHtml = `<span class="pill done">Terminé</span><span class="md-when">${esc(fmtDate(m.scheduled_at))}</span>`;
  }
  const venueHtml = m.venue ? `<span class="mvenue">${PIN_ICO}${esc(m.venue)}</span>` : '';

  let html = backBtnHtml();
  html += `<div class="md-board">
    <div class="md-comp">${esc(compLine)}</div>
    <div class="md-teams">
      <a class="md-team" href="#team/${m.home_team_id}">${logoHtml(m.home_team, 'mlogo')}<span class="md-tn ${awayWin ? 'loser' : ''}">${esc(m.home_team?.name || '')}</span></a>
      <div class="md-center">
        ${scoreShown
          ? `<div class="md-score"><span class="${awayWin ? 'loser' : ''}">${m.home_score ?? 0}</span><span class="sep">:</span><span class="${homeWin ? 'loser' : ''}">${m.away_score ?? 0}</span></div>`
          : `<div class="md-vs">VS</div>`}
      </div>
      <a class="md-team" href="#team/${m.away_team_id}">${logoHtml(m.away_team, 'mlogo')}<span class="md-tn ${homeWin ? 'loser' : ''}">${esc(m.away_team?.name || '')}</span></a>
    </div>
    ${qs}
    <div class="md-info">${infoHtml}${venueHtml}</div>
    <div class="md-actions">
      ${m.video_url ? `<a class="btn sm" href="${esc(m.video_url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none"/></svg>Voir la vidéo</a>` : ''}
      ${scoreShown ? `<button class="btn btn-ghost sm" id="matchShareBtn">${SHARE_ICON}Partager le résultat</button>` : ''}
    </div>
  </div>`;

  const homeStats = stats.filter((s) => s.team_id === m.home_team_id);
  const awayStats = stats.filter((s) => s.team_id === m.away_team_id);
  if (stats.length) {
    html += `<div class="block"><div class="block-head"><h2>Feuille de match</h2></div>${boxTableHtml(m.home_team, homeStats)}${boxTableHtml(m.away_team, awayStats)}</div>`;
  }
  if (events.length) {
    html += `<div class="block"><div class="block-head"><h2>Fil du match</h2></div><div class="pbp">${events.map(pbpRowHtml).join('')}</div></div>`;
  }
  if (!stats.length && !events.length) {
    html += emptyHtml('Détails à venir', done ? 'La feuille de match sera publiée prochainement.' : 'Les statistiques apparaîtront pendant et après la rencontre.', 'ball');
  }
  html += `<div id="officialsSlot"></div><div id="fanSlot"></div><div id="shotsSlot"></div><div id="photosSlot"></div><div id="chatSlot"></div><div id="h2hSlot"></div><div id="commentsSlot"></div>`;

  view.innerHTML = html;
  wireBack();
  $('#matchShareBtn')?.addEventListener('click', () => openShareCard(matchShareSpec(m)));
  fillOfficials(m.id);
  fillMatchFan(m, stats);
  fillShotChart(m);
  fillMatchPhotos(m.id);
  fillChat(m.id);
  fillHeadToHead(m);
  fillComments('match', m.id, '#commentsSlot');

  clearTimeout(detailTimer);
  if (live) {
    detailTimer = setTimeout(() => {
      if (location.hash.replace('#', '') === 'match/' + id) renderMatchDetail(id);
    }, 20000);
  }
}

// ------------------------------------------------------- fiche joueur
function statTile(v, label, isInt) {
  const val = isInt ? (v ?? 0) : Number(v ?? 0).toFixed(1);
  return `<div class="stat-tile"><b>${val}</b><span>${label}</span></div>`;
}
// cellule de la bande d'identité du club (points/V/D/joués) — plus compacte que .stat-tile,
// pensée pour s'intégrer à l'en-tête plutôt que d'ouvrir un bloc séparé.
function clubStat(v, label) {
  return `<div class="club-stat"><b>${v ?? 0}</b><span>${esc(label)}</span></div>`;
}
async function renderPlayer(id) {
  view.innerHTML = backBtnHtml() + loadingHtml(); wireBack(); window.scrollTo({ top: 0 });
  const uid = session?.user?.id;
  const [p, season, games, following] = await Promise.all([safe(getPlayer(id), null), safe(getPlayerSeason(id), null), safe(getPlayerGames(id, 8), []), uid ? safe(isFollowingPlayer(uid, id), false) : Promise.resolve(false)]);
  if (!p) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  const team = p.team;
  let html = backBtnHtml();
  html += `<div class="profile">
    <div class="profile-ava">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : initials(p.full_name)}</div>
    <div class="profile-info">
      <h1>${esc(p.full_name)}</h1>
      <div class="profile-sub">${[p.number ? '#' + p.number : null, p.position, team ? esc(team.name) : null].filter(Boolean).join(' · ')}</div>
      ${team ? `<a class="chip-link" href="#team/${team.id}">Voir le club →</a>` : ''}
      ${followBtnHtml(following, 'Suivre', 'Suivi')}
      ${socialLinksHtml(p, PLAYER_SOCIALS)}
    </div>
  </div>`;
  if (season) {
    html += `<div class="block"><div class="block-head"><h2>Moyennes de la saison</h2></div>
      <div class="stat-grid">
        ${statTile(season.ppg, 'Points')}${statTile(season.rpg, 'Rebonds')}${statTile(season.apg, 'Passes')}
        ${statTile(season.spg, 'Interceptions')}${statTile(season.bpg, 'Contres')}${statTile(season.games, 'Matchs', true)}
      </div></div>`;
  }
  if (games.length) {
    const rows = games.map((g) => {
      const m = g.match;
      const opp = m ? (m.home_team_id === p.team_id ? m.away_team : m.home_team) : null;
      const oppName = opp?.short_name || opp?.name || '—';
      return `<tr><td class="bx-p">${esc(oppName)}<span style="color:var(--dim);font-size:11px"> · ${fmtDate(m?.scheduled_at)}</span></td><td class="bx-pts">${g.points}</td><td>${g.rebounds}</td><td>${g.assists}</td><td>${g.steals}</td><td>${g.blocks}</td></tr>`;
    }).join('');
    html += `<div class="block"><div class="block-head"><h2>Derniers matchs</h2></div>
      <div style="overflow-x:auto"><table class="bx"><thead><tr><th class="bx-p">Adversaire</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Int</th><th>Ct</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  if (!season && !games.length) html += emptyHtml('Pas encore de statistiques', "Ce joueur n'a pas encore de match enregistré.", 'trophy');
  view.innerHTML = html; wireBack();
  const fb = $('#followBtn');
  if (fb) fb.addEventListener('click', async () => {
    if (!uid) return openAuth('login');
    try { if (following) await unfollowPlayer(uid, id); else await followPlayer(uid, id); toast(following ? 'Vous ne suivez plus' : 'Joueur suivi'); renderPlayer(id); } catch { toast('Action impossible'); }
  });
}

// ------------------------------------------------------- fiche club
async function renderTeam(id) {
  view.innerHTML = backBtnHtml() + loadingHtml(); wireBack(); window.scrollTo({ top: 0 });
  const uid = session?.user?.id;
  const [t, players, standing, matches, isFav, posts, sponsors, awards, ldb, highs, activePolls, photos, events, eventCounts, myRsvps, allTeamStats] = await Promise.all([safe(getTeam(id), null), safe(getTeamPlayers(id), []), safe(getTeamStanding(id), null), safe(getTeamMatches(id), []), uid ? safe(isFavoriteTeam(uid, id), false) : Promise.resolve(false), safe(listTeamPosts(id), []), safe(listClubSponsors(id), []), safe(listTeamAwards(id), []), safe(fanLeaderboardByTeam(id, 20), []), safe(listTeamGameHighs(id), []), safe(listActiveTeamPolls(id), []), safe(listTeamPhotos(id), []), safe(listClubEvents(id), []), safe(getEventCounts(id), new Map()), uid ? safe(listMyEventRsvps(), new Map()) : Promise.resolve(new Map()), safe(listAllTeamStats(), [])]);
  const upcomingEvents = events.filter((e) => tOf(e.starts_at) >= Date.now() - 3 * 3600 * 1000);
  const badges = computeClubBadges(id, matches, allTeamStats);
  if (!t) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  const crestColor = t.color || '#0E5F58';
  const statsHtml = standing ? `<div class="club-stats">${clubStat(standing.points, 'Points')}${clubStat(standing.wins, 'Victoires')}${clubStat(standing.losses, 'Défaites')}${clubStat(standing.played, 'Joués')}</div>` : '';
  let html = backBtnHtml();
  html += `<div class="profile">
    <div class="crest-badge" style="background:${esc(crestColor)};box-shadow:0 0 0 4px ${hexA(crestColor, 0.16)}">${t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : `<span>${esc(t.short_name || initials(t.name))}</span>`}</div>
    <div class="profile-info"><h1>${esc(t.name)}</h1><div class="profile-sub">${[labelOf(TEAM_GENDERS, t.gender), esc(t.city), t.founded_year ? 'Depuis ' + t.founded_year : null, t.coach ? 'Coach : ' + esc(t.coach) : null].filter(Boolean).join(' · ') || 'Club'}</div>${statsHtml}<div class="profile-actions">${followBtnHtml(isFav, 'Ajouter aux favoris', 'Dans mes favoris')}<button class="btn btn-ghost sm" id="teamShareBtn">${SHARE_ICON}Partager</button></div>${socialLinksHtml(t, TEAM_SOCIALS)}</div>
  </div>`;
  html += teamBadgesHtml(badges);
  if (t.presentation) html += `<div class="block"><div class="block-head"><h2>${bhIco('<path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/>')}À propos</h2></div><div class="team-about">${esc(t.presentation).replace(/\n+/g, '<br>')}</div></div>`;
  html += teamEventsHtml(upcomingEvents, eventCounts, myRsvps);
  if (players.length) {
    const rows = players.map((pl) => `<a class="roster-row" href="#player/${pl.id}"><span class="bx-num">${pl.number ?? ''}</span><span class="rr-name">${esc(pl.full_name)}</span><span class="rr-pos">${esc(pl.position || '')}</span></a>`).join('');
    html += `<div class="block"><div class="block-head"><h2>${bhIco('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>')}Effectif</h2></div><div class="roster">${rows}</div></div>`;
  }
  const live = matches.filter((m) => m.status === 'live');
  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const done = matches.filter((m) => m.status === 'finished');
  const show = [...live, ...upcoming.slice(0, 5), ...done.slice(-5).reverse()];
  if (show.length) html += `<div class="block"><div class="block-head"><h2>${bhIco('<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 010 18M3 12h18M5 6c4 3 10 3 14 0M5 18c4-3 10-3 14 0"/>')}Matchs</h2></div>${show.map(matchCardHtml).join('')}</div>`;
  if (posts.length) html += `<div class="block"><div class="block-head"><h2>${bhIco(CLUB_NAV_ICONS.megaphone)}Publications</h2></div>${posts.map((p) => postCardHtml(p, false)).join('')}</div>`;
  if (activePolls.length) html += `<div class="block"><div class="block-head"><h2>${bhIco(CLUB_NAV_ICONS.poll)}Sondages du club</h2></div><div id="teamPolls"></div></div>`;
  html += teamGalleryHtml(photos) + teamSupportersHtml(ldb) + teamPalmaresHtml(awards) + teamRecordsHtml(highs) + teamSponsorsHtml(sponsors);
  if (!players.length && !matches.length && !standing && !posts.length && !activePolls.length && !ldb.length && !awards.length && !highs.length && !sponsors.length && !photos.length && !t.presentation && !upcomingEvents.length && !badges.length) html += emptyHtml('Fiche à compléter', 'Les informations de ce club seront publiées prochainement.', 'ball');
  view.innerHTML = html; wireBack();
  wireTeamEvents(id, myRsvps);
  if (activePolls.length) { const slot = $('#teamPolls'); for (const p of activePolls) slot.appendChild(await pollCardEl(p, () => renderTeam(id))); }
  if (photos.length) { const urls = photos.map((p) => p.url); view.querySelectorAll('#teamGallery .photo-thumb').forEach((b) => b.addEventListener('click', () => openLightbox(urls, Number(b.dataset.i)))); }
  $('#teamShareBtn')?.addEventListener('click', () => openShareCard(teamShareSpec(t, standing)));
  view.querySelectorAll('[data-share-post]').forEach((b) => b.addEventListener('click', () => {
    const p = posts.find((x) => x.id === b.dataset.sharePost); if (p) openShareCard(postShareSpec(t, p));
  }));
  const fb = $('#followBtn');
  if (fb) fb.addEventListener('click', async () => {
    if (!uid) return openAuth('login');
    try { if (isFav) await removeFavorite(uid, id); else await addFavorite(uid, id); toast(isFav ? 'Retiré des favoris' : 'Ajouté aux favoris'); renderTeam(id); } catch { toast('Action impossible'); }
  });
}

// ------------------------------------------------------- détail actualité
async function renderNewsDetail(id) {
  view.innerHTML = backBtnHtml() + loadingHtml(); wireBack(); window.scrollTo({ top: 0 });
  const n = await safe(getNewsItem(id), null);
  if (!n) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  const d = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(n.published_at));
  const body = (n.body || '').split(/\n+/).filter(Boolean).map((par) => `<p>${esc(par)}</p>`).join('') || '<p></p>';
  let html = backBtnHtml();
  html += `<article class="article">
    ${n.cover_url ? `<div class="article-cover"><img src="${esc(n.cover_url)}" alt=""></div>` : ''}
    ${n.category ? `<span class="news-cat">${esc(n.category)}</span>` : ''}
    <h1 class="article-title">${esc(n.title)}</h1>
    <div class="article-meta">${d}${n.author ? ' · ' + esc(n.author) : ''}</div>
    <div class="article-body">${body}</div>
  </article><div id="commentsSlot"></div>`;
  view.innerHTML = html; wireBack();
  fillComments('news', id, '#commentsSlot');
}

// ------------------------------------------------------- vidéos
async function renderVideos() {
  view.innerHTML = `<h1 class="view-title">Vidéos</h1><p class="view-sub">Résumés et temps forts des rencontres.</p><div id="vidBody">${loadingHtml()}</div>`;
  const vids = await safe(listVideos(), null);
  const el = $('#vidBody');
  if (vids === null) { el.innerHTML = errorHtml(); return; }
  if (!vids.length) { el.innerHTML = emptyHtml('Pas encore de vidéo', 'Les résumés vidéo apparaîtront ici.', 'news'); return; }
  el.innerHTML = `<div class="news-grid">${vids.map((m) => `<a class="news-card" href="${esc(m.video_url)}" target="_blank" rel="noopener">
    <div class="news-cover"><span class="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none"/></svg></span></div>
    <div class="news-body"><h3>${esc(m.home_team?.name || '')} — ${esc(m.away_team?.name || '')}</h3><span class="date">${fmtDate(m.scheduled_at)}${m.competition?.name ? ' · ' + esc(m.competition.name) : ''}</span></div>
  </a>`).join('')}</div>`;
}

// ------------------------------------------------------- clubs (liste)
async function renderClubs() {
  view.innerHTML = `<h1 class="view-title">Clubs</h1><p class="view-sub">Les équipes engagées.</p>
    <div class="sub-links"><a class="sub-link" href="#inscription-club">${icoSvg('<path d="M12 5v14M5 12h14"/>')}Inscrire mon club</a></div>
    <div id="clubBody">${loadingHtml()}</div>`;
  const teams = await safe(listTeams(), null);
  const el = $('#clubBody');
  if (teams === null) { el.innerHTML = errorHtml(); return; }
  if (!teams.length) { el.innerHTML = emptyHtml('Aucun club', 'Les clubs apparaîtront ici.', 'ball'); return; }
  el.innerHTML = `<div class="club-grid">${teams.map((t) => `<a class="club-card" href="#team/${t.id}">${logoHtml(t)}<span class="cc-name">${esc(t.name)}</span>${t.city ? `<span class="cc-city">${esc(t.city)}</span>` : ''}</a>`).join('')}</div>`;
}

// ------------------------------------------------------- fan zone (sondages)
async function renderFanzone() {
  view.innerHTML = `<h1 class="view-title">Fan Zone</h1><p class="view-sub">Donnez votre avis aux sondages de la fédération.</p><div id="fzBody">${loadingHtml()}</div>`;
  const polls = await safe(listPolls(), null);
  const el = $('#fzBody');
  if (polls === null) { el.innerHTML = errorHtml(); return; }
  const active = polls.filter((p) => p.is_active && !p.team_id);
  if (!active.length) { el.innerHTML = emptyHtml('Aucun sondage', 'Les sondages de la fédération apparaîtront ici.', 'news'); return; }
  el.innerHTML = '';
  for (const p of active) el.appendChild(await pollCardEl(p));
}
async function pollCardEl(p, refresh) {
  const uid = session?.user?.id;
  const [results, mine] = await Promise.all([safe(pollResults(p.id), []), uid ? safe(myPollVote(p.id, uid), null) : Promise.resolve(null)]);
  const total = results.reduce((s, r) => s + Number(r.votes || 0), 0);
  const voted = mine != null;
  const opts = (p.options || []).map((opt, i) => {
    const votes = Number(results.find((r) => r.option_index === i)?.votes || 0);
    const pct = total ? Math.round((votes / total) * 100) : 0;
    return `<button class="poll-opt${mine === i ? ' mine' : ''}" data-i="${i}" ${voted ? 'disabled' : ''}>
      <span class="po-fill" style="width:${voted ? pct : 0}%"></span>
      <span class="po-label">${esc(opt)}</span>
      ${voted ? `<span class="po-pct">${pct}%</span>` : ''}
    </button>`;
  }).join('');
  const foot = voted ? `${total} vote${total > 1 ? 's' : ''}` : uid ? 'Touchez une option pour voter' : 'Connectez-vous pour voter';
  const wrap = document.createElement('div');
  wrap.className = 'poll';
  wrap.innerHTML = `<h3>${esc(p.question)}</h3><div class="poll-opts">${opts}</div><div class="poll-foot">${foot}</div>`;
  if (!voted) {
    wrap.querySelectorAll('.poll-opt').forEach((b) => b.addEventListener('click', async () => {
      if (!uid) return openAuth('login');
      try { await votePoll(p.id, uid, Number(b.dataset.i)); toast('Vote enregistré'); (refresh || renderFanzone)(); }
      catch { toast('Vote impossible'); }
    }));
  }
  return wrap;
}

// ------------------------------------------------------- hub « Plus »
function renderPlus() {
  const items = [
    { r: 'videos', label: 'Vidéos', ic: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none"/>' },
    { r: 'clubs', label: 'Clubs', ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>' },
    { r: 'playoffs', label: 'Playoffs', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>' },
    { r: 'fanzone', label: 'Fan Zone', ic: '<path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z"/>' },
    { r: 'recherche', label: 'Recherche', ic: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' },
    { r: 'favoris', label: 'Mes favoris', ic: '<path d="M12 21s-7-4.6-9.5-8.3C.9 10.4 1.4 7 4 5.7 6 4.7 8.3 5.3 9.6 7L12 9.8 14.4 7c1.3-1.7 3.6-2.3 5.6-1.3 2.6 1.3 3.1 4.7 1.5 7C19 16.4 12 21 12 21z"/>' },
    { r: 'comparateur', label: 'Comparateur', ic: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
    { r: 'supporters', label: 'Classement fans', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'records', label: 'Records', ic: '<circle cx="12" cy="8" r="5"/><path d="M8.2 12.5L7 22l5-3 5 3-1.2-9.5"/>' },
    { r: 'stats-equipes', label: 'Stats équipes', ic: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
    { r: 'stats-avancees', label: 'Stats avancées', ic: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>' },
    { r: 'quiz', label: 'Quiz', ic: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>' },
    { r: 'palmares', label: 'Palmarès', ic: '<circle cx="12" cy="8" r="5"/><path d="M8.2 12.5L7 22l5-3 5 3-1.2-9.5"/>' },
    { r: 'medias', label: 'Médias', ic: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
    { r: 'photos', label: 'Photos', ic: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>' },
    { r: 'agenda', label: 'Agenda', ic: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { r: 'arbitres', label: 'Arbitres', ic: '<path d="M6 9l6-6 6 6M6 9v11h12V9M9 13h6"/>' },
    { r: 'discipline', label: 'Discipline', ic: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>' },
    { r: 'apropos', label: 'La fédération', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>' },
  ];
  view.innerHTML = `<h1 class="view-title">Plus</h1><p class="view-sub">Explorez tout le basket guinéen.</p>
    <div class="plus-grid">${items.map((it) => `<a class="plus-card" href="#${it.r}"><span class="plus-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.ic}</svg></span><b>${it.label}</b></a>`).join('')}</div>`;
}

// -- fan zone d'un match : pronostic + vote MVP (remplit #fanSlot)
async function fillMatchFan(m, stats) {
  const slot = $('#fanSlot');
  if (!slot) return;
  const uid = session?.user?.id;
  const [predRes, myPred, mvpRes, myMvp] = await Promise.all([
    safe(predictionResults(m.id), []),
    uid ? safe(myPrediction(m.id, uid), null) : Promise.resolve(null),
    safe(mvpResults(m.id), []),
    uid ? safe(myMvpVote(m.id, uid), null) : Promise.resolve(null),
  ]);
  if ($('#fanSlot') !== slot) return; // l'utilisateur a changé de page
  let html = `<div class="block"><div class="block-head"><h2>Fan Zone</h2></div>`;
  html += pronosticHtml(m, predRes, myPred, uid);
  if (stats.length) html += mvpHtml(stats, mvpRes, myMvp, uid);
  html += `</div>`;
  slot.innerHTML = html;
  slot.querySelectorAll('.pred-opt:not([disabled])').forEach((b) => b.addEventListener('click', async () => {
    if (!uid) return openAuth('login');
    try { await votePrediction(m.id, uid, b.dataset.team); toast('Pronostic enregistré'); renderMatchDetail(m.id); } catch { toast('Impossible'); }
  }));
  slot.querySelectorAll('.poll-opt[data-player]:not([disabled])').forEach((b) => b.addEventListener('click', async () => {
    if (!uid) return openAuth('login');
    try { await voteMvp(m.id, uid, b.dataset.player); toast('Vote MVP enregistré'); renderMatchDetail(m.id); } catch { toast('Impossible'); }
  }));
}
function pronosticHtml(m, res, myPred, uid) {
  const total = res.reduce((s, r) => s + Number(r.votes || 0), 0);
  const opt = (team, tid) => {
    const votes = Number(res.find((r) => r.team_id === tid)?.votes || 0);
    const pct = total ? Math.round((votes / total) * 100) : 0;
    return `<button class="pred-opt${myPred === tid ? ' mine' : ''}" data-team="${tid}" ${myPred != null ? 'disabled' : ''}>
      <span class="po-fill" style="width:${myPred != null ? pct : 0}%"></span>
      <span class="po-label">${logoHtml(team, 'mlogo')}<span>${esc(team?.name || '')}</span></span>
      ${myPred != null ? `<span class="po-pct">${pct}%</span>` : ''}
    </button>`;
  };
  const foot = myPred != null ? `${total} pronostic${total > 1 ? 's' : ''}` : uid ? 'Qui va gagner ? Touchez pour pronostiquer' : 'Connectez-vous pour pronostiquer';
  return `<div class="poll"><h3>Pronostic</h3><div class="poll-opts pred-opts">${opt(m.home_team, m.home_team_id)}${opt(m.away_team, m.away_team_id)}</div><div class="poll-foot">${foot}</div></div>`;
}
function mvpHtml(stats, res, myMvp, uid) {
  const total = res.reduce((s, r) => s + Number(r.votes || 0), 0);
  const rows = stats.map((s) => {
    const p = s.player;
    if (!p) return '';
    const votes = Number(res.find((r) => r.player_id === p.id)?.votes || 0);
    const pct = total ? Math.round((votes / total) * 100) : 0;
    return `<button class="poll-opt${myMvp === p.id ? ' mine' : ''}" data-player="${p.id}" ${myMvp != null ? 'disabled' : ''}>
      <span class="po-fill" style="width:${myMvp != null ? pct : 0}%"></span>
      <span class="po-label">${esc(p.full_name)} · ${s.points} pts</span>
      ${myMvp != null ? `<span class="po-pct">${pct}%</span>` : ''}
    </button>`;
  }).join('');
  const foot = myMvp != null ? `${total} vote${total > 1 ? 's' : ''}` : uid ? 'Élisez le MVP du match' : 'Connectez-vous pour voter le MVP';
  return `<div class="poll"><h3>Vote MVP</h3><div class="poll-opts">${rows}</div><div class="poll-foot">${foot}</div></div>`;
}

// -- face-à-face (remplit #h2hSlot)
async function fillHeadToHead(m) {
  const slot = $('#h2hSlot');
  if (!slot) return;
  const h2h = await safe(getHeadToHead(m.home_team_id, m.away_team_id), []);
  if ($('#h2hSlot') !== slot || !h2h.length) return;
  let homeW = 0, awayW = 0;
  h2h.forEach((x) => {
    if (x.home_score === x.away_score) return;
    const winner = x.home_score > x.away_score ? x.home_team_id : x.away_team_id;
    if (winner === m.home_team_id) homeW++; else if (winner === m.away_team_id) awayW++;
  });
  slot.innerHTML = `<div class="block"><div class="block-head"><h2>Face-à-face</h2></div>
    <div class="h2h-tally"><span>${esc(m.home_team?.short_name || m.home_team?.name || '')}</span><b>${homeW} – ${awayW}</b><span>${esc(m.away_team?.short_name || m.away_team?.name || '')}</span></div>
    ${h2h.slice(0, 8).map(matchCardHtml).join('')}</div>`;
}

// -- recherche
let searchTimer = null;
function renderSearch() {
  view.innerHTML = `<h1 class="view-title">Recherche</h1>
    <div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
      <input type="search" id="searchInput" placeholder="Joueur, club, actualité…" autocomplete="off" autofocus /></div>
    <div id="searchBody"><p class="view-sub">Tapez au moins 2 caractères.</p></div>`;
  const input = $('#searchInput');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const term = input.value.trim();
    if (term.length < 2) { $('#searchBody').innerHTML = '<p class="view-sub">Tapez au moins 2 caractères.</p>'; return; }
    $('#searchBody').innerHTML = loadingHtml();
    searchTimer = setTimeout(async () => {
      const res = await safe(searchAll(term), null);
      if (input.value.trim() !== term) return; // frappe plus récente
      $('#searchBody').innerHTML = searchResultsHtml(res);
    }, 300);
  });
}
function searchResultsHtml(res) {
  if (!res) return errorHtml();
  const { players, teams, news } = res;
  if (!players.length && !teams.length && !news.length) return emptyHtml('Aucun résultat', 'Essayez un autre mot-clé.', 'inbox');
  let html = '';
  if (teams.length) html += `<div class="block"><div class="block-head"><h2>Clubs</h2></div><div class="roster">${teams.map((t) => `<a class="roster-row" href="#team/${t.id}">${logoHtml(t)}<span class="rr-name">${esc(t.name)}</span></a>`).join('')}</div></div>`;
  if (players.length) html += `<div class="block"><div class="block-head"><h2>Joueurs</h2></div><div class="roster">${players.map((p) => `<a class="roster-row" href="#player/${p.id}"><span class="lava" style="width:32px;height:32px;font-size:12px">${initials(p.full_name)}</span><span class="rr-name">${esc(p.full_name)}</span></a>`).join('')}</div></div>`;
  if (news.length) html += `<div class="block"><div class="block-head"><h2>Actualités</h2></div><div class="roster">${news.map((n) => `<a class="roster-row" href="#news/${n.id}"><span class="rr-name">${esc(n.title)}</span></a>`).join('')}</div></div>`;
  return html;
}

// -- mes favoris (clubs favoris + joueurs suivis)
async function renderFavoris() {
  view.innerHTML = `<h1 class="view-title">Mes favoris</h1><div id="favBody">${loadingHtml()}</div>`;
  const el = $('#favBody');
  if (!session) {
    el.innerHTML = `<div class="login-prompt"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.6-9.5-8.3C.9 10.4 1.4 7 4 5.7 6 4.7 8.3 5.3 9.6 7L12 9.8"/></svg></div><h3>Connectez-vous</h3><p>Créez un compte pour suivre vos clubs et joueurs préférés.</p><button class="btn" id="favLogin">Se connecter</button></div>`;
    $('#favLogin').addEventListener('click', () => openAuth('login'));
    return;
  }
  const [teams, players, pushOn] = await Promise.all([safe(listFavoriteTeams(), []), safe(listFollowedPlayers(), []), isPushEnabled()]);
  let html = pushBannerHtml(pushOn);
  if (teams.length) html += `<div class="block"><div class="block-head"><h2>Clubs favoris</h2></div><div class="club-grid">${teams.map((t) => `<a class="club-card" href="#team/${t.id}">${logoHtml(t)}<span class="cc-name">${esc(t.name)}</span></a>`).join('')}</div></div>`;
  if (players.length) html += `<div class="block"><div class="block-head"><h2>Joueurs suivis</h2></div><div class="roster">${players.map((p) => `<a class="roster-row" href="#player/${p.id}"><span class="lava" style="width:32px;height:32px;font-size:12px">${initials(p.full_name)}</span><span class="rr-name">${esc(p.full_name)}</span></a>`).join('')}</div></div>`;
  if (!teams.length && !players.length) html += emptyHtml('Rien pour le moment', 'Ajoutez des clubs et joueurs en favoris depuis leur fiche.', 'trophy');
  el.innerHTML = html;
  wirePushBanner(pushOn);
}

function followBtnHtml(active, label, labelActive) {
  return `<button class="fav-btn${active ? ' active' : ''}" id="followBtn">
    <svg viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-7-4.6-9.5-8.3C.9 10.4 1.4 7 4 5.7 6 4.7 8.3 5.3 9.6 7L12 9.8 14.4 7c1.3-1.7 3.6-2.3 5.6-1.3 2.6 1.3 3.1 4.7 1.5 7C19 16.4 12 21 12 21z"/></svg>
    ${active ? labelActive : label}
  </button>`;
}

// -- à propos (fédération + partenaires)
const TIER_ORDER = ['principal', 'officiel', 'media', 'partenaire'];
const TIER_LABELS = { principal: 'Partenaire principal', officiel: 'Partenaires officiels', media: 'Partenaires médias', partenaire: 'Partenaires' };
async function renderApropos() {
  view.innerHTML = `<h1 class="view-title">La fédération</h1><div id="apBody">${loadingHtml()}</div>`;
  const [info, sponsors] = await Promise.all([safe(getFederationInfo(), {}), safe(listSponsors(), [])]);
  let html = `<div class="ap-card"><img src="assets/logo-card.png" alt="Logo FGBB"><h2>Fédération Guinéenne de Basket-Ball</h2>${info.president ? `<p class="ap-pres">Président : ${esc(info.president)}</p>` : ''}<div class="tricolor" style="justify-content:center;margin-top:14px"><span class="r"></span><span class="y"></span><span class="g"></span></div>${socialLinksHtml(info, FED_SOCIALS)}</div>`;
  if (info.about) html += `<div class="block"><div class="block-head"><h2>Présentation</h2></div><p class="ap-about">${esc(info.about)}</p></div>`;
  const contacts = [];
  if (info.address) contacts.push(['Adresse', esc(info.address), null]);
  if (info.phone) contacts.push(['Téléphone', esc(info.phone), 'tel:' + info.phone.replace(/[\s.]/g, '')]);
  if (info.email) contacts.push(['E-mail', esc(info.email), 'mailto:' + info.email.trim()]);
  if (info.website) contacts.push(['Site web', esc(info.website), externalUrl(info.website)]);
  if (info.facebook) contacts.push(['Facebook', esc(info.facebook), externalUrl(info.facebook)]);
  if (info.youtube) contacts.push(['YouTube', esc(info.youtube), externalUrl(info.youtube)]);
  if (contacts.length) {
    html += `<div class="block"><div class="block-head"><h2>Contact</h2></div><div class="roster">${contacts.map(([l, v, href]) => {
      const inner = `<span class="rr-name"><b style="color:var(--muted);font-weight:600">${l} : </b>${v}</span>`;
      return href ? `<a class="roster-row" href="${href}" target="_blank" rel="noopener">${inner}</a>` : `<div class="roster-row">${inner}</div>`;
    }).join('')}</div></div>`;
  }
  const groups = TIER_ORDER.map((tier) => ({ tier, items: sponsors.filter((s) => s.tier === tier) })).filter((g) => g.items.length);
  if (groups.length) {
    html += `<div class="block"><div class="block-head"><h2>Partenaires</h2></div>${groups.map((g) => `<div class="sponsor-tier"><h3>${TIER_LABELS[g.tier]}</h3><div class="sponsor-grid">${g.items.map((s) => {
      const href = externalUrl(s.url);
      const body = s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.name)}">` : `<span>${esc(s.name)}</span>`;
      return href ? `<a class="sponsor" href="${href}" target="_blank" rel="noopener">${body}</a>` : `<div class="sponsor">${body}</div>`;
    }).join('')}</div></div>`).join('')}</div>`;
  }
  if (!info.about && !contacts.length && !groups.length) html += emptyHtml('Informations à venir', 'Les coordonnées de la fédération seront publiées prochainement.', 'inbox');
  $('#apBody').innerHTML = html;
}

// -- comparateur de joueurs
let compareMode = 'joueurs';
async function renderCompare() {
  view.innerHTML = `<h1 class="view-title">Comparateur</h1>
    <div class="segmented" id="cmpMode">${[['joueurs', 'Joueurs'], ['equipes', 'Équipes']].map(([k, l]) => `<button class="seg ${compareMode === k ? 'active' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
    <div id="cmpPickers">${loadingHtml()}</div><div id="cmpBody"></div>`;
  $('#cmpMode').querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { compareMode = b.dataset.m; renderCompare(); }));
  const isTeams = compareMode === 'equipes';
  const list = await safe(isTeams ? listTeams() : listPlayersLite(), []);
  const label = isTeams ? 'un club' : 'un joueur';
  const opts = [`<option value="">— Choisir ${label} —</option>`].concat(list.map((x) => `<option value="${x.id}">${esc(x.name || x.full_name)}</option>`)).join('');
  $('#cmpPickers').innerHTML = `<div class="cmp-pickers"><select id="cmpA" class="cmp-select">${opts}</select><span class="cmp-vs">VS</span><select id="cmpB" class="cmp-select">${opts}</select></div>`;
  const run = async () => {
    const a = $('#cmpA').value, b = $('#cmpB').value;
    if (!a || !b) { $('#cmpBody').innerHTML = ''; return; }
    $('#cmpBody').innerHTML = loadingHtml();
    if (isTeams) {
      const [ta, tb, sa, sb2] = await Promise.all([safe(getTeam(a), null), safe(getTeam(b), null), safe(getTeamStanding(a), null), safe(getTeamStanding(b), null)]);
      $('#cmpBody').innerHTML = compareTeamsHtml(ta, tb, sa, sb2);
    } else {
      const [pa, pb, sa, sb2] = await Promise.all([safe(getPlayer(a), null), safe(getPlayer(b), null), safe(getPlayerSeason(a), null), safe(getPlayerSeason(b), null)]);
      $('#cmpBody').innerHTML = compareHtml(pa, pb, sa, sb2);
    }
  };
  $('#cmpA').addEventListener('change', run);
  $('#cmpB').addEventListener('change', run);
}
function compareTeamsHtml(ta, tb, sa, sb) {
  if (!ta || !tb) return '';
  const num = (s, k) => (s ? Number(s[k] ?? 0) : 0);
  const winpct = (s) => (s && s.played ? Math.round((s.wins / s.played) * 100) : 0);
  const defs = [['points', 'Points', 1], ['wins', 'Victoires', 1], ['losses', 'Défaites', -1], ['played', 'Joués', 0]];
  const rows = defs.map(([k, label, dir]) => {
    const a = num(sa, k), b = num(sb, k);
    const aw = dir > 0 ? sa && a >= b : dir < 0 ? sa && a <= b : false;
    const bw = dir > 0 ? sb && b >= a : dir < 0 ? sb && b <= a : false;
    return `<tr><td class="${aw ? 'cmp-win' : ''}">${sa ? a : '—'}</td><td class="cmp-lbl">${label}</td><td class="${bw ? 'cmp-win' : ''}">${sb ? b : '—'}</td></tr>`;
  });
  const wa = winpct(sa), wb = winpct(sb);
  rows.push(`<tr><td class="${sa && wa >= wb ? 'cmp-win' : ''}">${sa ? wa + '%' : '—'}</td><td class="cmp-lbl">% victoires</td><td class="${sb && wb >= wa ? 'cmp-win' : ''}">${sb ? wb + '%' : '—'}</td></tr>`);
  return `<div class="cmp-head"><div class="cmp-name">${logoHtml(ta)}<span>${esc(ta.name)}</span></div><div class="cmp-name right"><span>${esc(tb.name)}</span>${logoHtml(tb)}</div></div><table class="cmp-table"><tbody>${rows.join('')}</tbody></table>`;
}
function compareHtml(pa, pb, sa, sb) {
  if (!pa || !pb) return '';
  const defs = [['ppg', 'Points'], ['rpg', 'Rebonds'], ['apg', 'Passes'], ['spg', 'Interceptions'], ['bpg', 'Contres'], ['games', 'Matchs']];
  const disp = (s, k) => (s ? (k === 'games' ? (s[k] ?? 0) : Number(s[k] ?? 0).toFixed(1)) : '—');
  const num = (s, k) => (s ? Number(s[k] ?? 0) : 0);
  const rows = defs.map(([k, label]) => `<tr><td class="${num(sa, k) >= num(sb, k) && sa ? 'cmp-win' : ''}">${disp(sa, k)}</td><td class="cmp-lbl">${label}</td><td class="${num(sb, k) >= num(sa, k) && sb ? 'cmp-win' : ''}">${disp(sb, k)}</td></tr>`).join('');
  return `<div class="cmp-head"><div class="cmp-name"><span class="lava">${initials(pa.full_name)}</span><span>${esc(pa.full_name)}</span></div><div class="cmp-name right"><span>${esc(pb.full_name)}</span><span class="lava">${initials(pb.full_name)}</span></div></div>
    <table class="cmp-table"><tbody>${rows}</tbody></table>`;
}

// -- palmarès
async function renderPalmares() {
  view.innerHTML = `<h1 class="view-title">Palmarès</h1><p class="view-sub">Les distinctions de la fédération.</p><div id="pmBody">${loadingHtml()}</div>`;
  const awards = await safe(listAwards(), null);
  const el = $('#pmBody');
  if (awards === null) return void (el.innerHTML = errorHtml());
  if (!awards.length) return void (el.innerHTML = emptyHtml('Pas encore de distinction', 'Les récompenses apparaîtront ici.', 'trophy'));
  el.innerHTML = `<div class="roster">${awards.map((a) => {
    const who = a.player ? `<a href="#player/${a.player.id}">${esc(a.player.full_name)}</a>` : a.team ? `<a href="#team/${a.team.id}">${esc(a.team.name)}</a>` : (a.label ? esc(a.label) : '—');
    return `<div class="roster-row"><span class="award-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/></svg></span><span class="rr-name"><b>${esc(AWARD_LABELS[a.kind] || 'Distinction')}</b> — ${who}${a.note ? `<span style="display:block;color:var(--dim);font-size:12.5px">${esc(a.note)}</span>` : ''}</span><span class="rr-pos">${a.awarded_at ? fmtDate(a.awarded_at) : ''}</span></div>`;
  }).join('')}</div>`;
}
// -- arbitres
async function renderArbitres() {
  view.innerHTML = `<h1 class="view-title">Arbitres</h1><p class="view-sub">Le corps arbitral de la fédération.</p><div id="arbBody">${loadingHtml()}</div>`;
  const refs = await safe(listReferees(), null);
  const el = $('#arbBody');
  if (refs === null) return void (el.innerHTML = errorHtml());
  if (!refs.length) return void (el.innerHTML = emptyHtml('Aucun arbitre', 'La liste des arbitres apparaîtra ici.', 'inbox'));
  el.innerHTML = `<div class="roster">${refs.map((r) => `<div class="roster-row"><span class="lava" style="width:38px;height:38px;font-size:13px">${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="">` : initials(r.full_name)}</span><span class="rr-name">${esc(r.full_name)}${r.city ? `<span style="color:var(--dim);font-size:12.5px"> · ${esc(r.city)}</span>` : ''}</span><span class="rr-pos">${REFEREE_LEVEL_LABELS[r.level] || ''}</span></div>`).join('')}</div>`;
}
// -- discipline
async function renderDiscipline() {
  view.innerHTML = `<h1 class="view-title">Discipline</h1><p class="view-sub">Décisions de la commission de discipline.</p><div id="disBody">${loadingHtml()}</div>`;
  const sanctions = await safe(listSanctions(), null);
  const el = $('#disBody');
  if (sanctions === null) return void (el.innerHTML = errorHtml());
  if (!sanctions.length) return void (el.innerHTML = emptyHtml('Aucune sanction', 'Les décisions disciplinaires apparaîtront ici.', 'inbox'));
  el.innerHTML = sanctions.map((s) => {
    const who = s.player ? `<a href="#player/${s.player.id}">${esc(s.player.full_name)}</a>` : s.team ? `<a href="#team/${s.team.id}">${esc(s.team.name)}</a>` : '—';
    const details = [];
    if (s.games) details.push(`${s.games} match${s.games > 1 ? 's' : ''}`);
    if (s.amount_gnf) details.push(formatGnf(s.amount_gnf));
    details.push(SANCTION_STATUS_LABELS[s.status] || '');
    return `<div class="sanction"><div class="sanction-top"><b>${SANCTION_LABELS[s.kind] || ''}</b><span class="sanction-date">${fmtDate(s.decided_at)}</span></div><div class="sanction-who">${who} · ${details.filter(Boolean).join(' · ')}</div>${s.reason ? `<div class="sanction-reason">${esc(s.reason)}</div>` : ''}</div>`;
  }).join('');
}
// -- médias
let mediaFilter = '';
async function renderMedias() {
  view.innerHTML = `<h1 class="view-title">Médias</h1><div class="segmented" id="medSeg">${[['', 'Tout'], ...MEDIA_KINDS.map((k) => [k.id, k.label])].map(([v, l]) => `<button class="seg ${mediaFilter === v ? 'active' : ''}" data-k="${v}">${l}</button>`).join('')}</div><div id="medBody">${loadingHtml()}</div>`;
  $('#medSeg').querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { mediaFilter = b.dataset.k; renderMedias(); }));
  const media = await safe(listMedia(mediaFilter || null), null);
  const el = $('#medBody');
  if (media === null) return void (el.innerHTML = errorHtml());
  if (!media.length) return void (el.innerHTML = emptyHtml('Pas encore de média', 'Interviews, podcasts et reportages apparaîtront ici.', 'news'));
  el.innerHTML = `<div class="news-grid">${media.map((m) => `<a class="news-card" href="${esc(externalUrl(m.url) || '#')}" target="_blank" rel="noopener"><div class="news-cover">${m.cover_url ? `<img src="${esc(m.cover_url)}" alt="">` : `<span class="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>`}</div><div class="news-body"><span class="news-cat">${mediaOne(m.kind)}</span><h3>${esc(m.title)}</h3>${m.description ? `<p class="excerpt">${esc(m.description).slice(0, 120)}</p>` : ''}<span class="date">${fmtDate(m.published_at)}${m.duration_min ? ` · ${m.duration_min} min` : ''}</span></div></a>`).join('')}</div>`;
}
// -- agenda
async function renderAgenda() {
  view.innerHTML = `<h1 class="view-title">Agenda</h1><p class="view-sub">Les rendez-vous de la fédération.</p><div id="agBody">${loadingHtml()}</div>`;
  const events = await safe(listEvents(), null);
  const el = $('#agBody');
  if (events === null) return void (el.innerHTML = errorHtml());
  if (!events.length) return void (el.innerHTML = emptyHtml('Aucun événement', "L'agenda de la fédération apparaîtra ici.", 'inbox'));
  el.innerHTML = events.map((e) => {
    const dd = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit' }).format(new Date(e.starts_at));
    const mm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, month: 'short' }).format(new Date(e.starts_at));
    return `<div class="event"><div class="event-date"><b>${dd}</b><span>${mm}</span></div><div class="event-info"><span class="news-cat">${EVENT_CAT_LABELS[e.category] || 'Autre'}</span><h3>${esc(e.title)}</h3>${e.location ? `<div class="event-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(e.location)}</div>` : ''}${e.description ? `<p class="excerpt">${esc(e.description).slice(0, 140)}</p>` : ''}</div></div>`;
  }).join('');
}
// -- badges du supporter (dérivés de my_fan_stats, comme l'app mobile)
const BADGES = [
  { label: 'Premier pas', desc: 'Jouer son premier pronostic', color: '#3BD61B', val: (s) => s.predictions, goal: 1 },
  { label: 'Supporter assidu', desc: 'Jouer 10 pronostics', color: '#2BC48A', val: (s) => s.predictions, goal: 10 },
  { label: 'Fidèle du championnat', desc: 'Jouer 25 pronostics', color: '#CE1126', val: (s) => s.predictions, goal: 25 },
  { label: 'Œil de lynx', desc: 'Gagner 5 pronostics', color: '#2BC48A', val: (s) => s.correct, goal: 5 },
  { label: 'Oracle du basket', desc: 'Gagner 15 pronostics', color: '#FCD116', val: (s) => s.correct, goal: 15 },
  { label: 'Cerveau du basket', desc: 'Marquer 10 points de quiz', color: '#4D9BE6', val: (s) => s.quiz_points, goal: 10 },
  { label: 'Faiseur de MVP', desc: 'Voter 5 fois pour le MVP', color: '#FCD116', val: (s) => s.mvp_votes, goal: 5 },
  { label: 'Centurion', desc: 'Atteindre 100 points', color: '#3BD61B', val: (s) => s.points, goal: 100 },
  { label: 'Sur le podium', desc: 'Entrer dans le top 3', color: '#FCD116', val: (s) => (s.points > 0 && s.position_no >= 1 && s.position_no <= 3 ? 1 : 0), goal: 1 },
];
function badgesHtml(stats) {
  const s = stats ?? { points: 0, predictions: 0, correct: 0, quiz_points: 0, mvp_votes: 0, position_no: 0 };
  const earned = BADGES.filter((b) => b.val(s) >= b.goal).length;
  return `<div class="block"><div class="block-head"><h2>Mes badges (${earned}/${BADGES.length})</h2></div><div class="badge-grid">${BADGES.map((b) => {
    const v = b.val(s), ok = v >= b.goal;
    return `<div class="badge${ok ? ' on' : ''}"${ok ? ` style="--bc:${b.color}"` : ''}><span class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.2 12.5L7 22l5-3 5 3-1.2-9.5"/></svg></span><b>${b.label}</b><span class="badge-desc">${ok ? b.desc : `${Math.min(v, b.goal)} / ${b.goal}`}</span></div>`;
  }).join('')}</div></div>`;
}
// -- classement des supporters
async function renderSupporters() {
  view.innerHTML = `<h1 class="view-title">Classement des supporters</h1><p class="view-sub">Gagnez des points avec les pronostics, le vote MVP et les quiz.</p><div id="ldbBody">${loadingHtml()}</div>`;
  const [rows, mine] = await Promise.all([safe(getLeaderboard(50), null), session ? safe(getMyFanStats(), null) : Promise.resolve(null)]);
  const el = $('#ldbBody');
  if (rows === null) return void (el.innerHTML = errorHtml());
  let html = '';
  if (mine) html += `<div class="stat-grid" style="margin-bottom:22px">${statTile(mine.points, 'Mes points', true)}${statTile(mine.correct, 'Pronostics réussis', true)}${statTile(mine.position_no, 'Mon rang', true)}</div>`;
  if (session) html += badgesHtml(mine);
  if (rows.length) html += `<div class="block"><div class="block-head"><h2>Classement</h2></div><div class="roster">${rows.map((r) => `<div class="roster-row${r.is_me ? ' me' : ''}"><span class="lrank" style="width:28px">${r.position_no}</span><span class="rr-name">${esc(r.name)}${r.is_me ? ' <b style="color:var(--accent)">(vous)</b>' : ''}</span><span class="rr-pos"><b style="color:var(--accent)">${r.points}</b> pts</span></div>`).join('')}</div></div>`;
  else html += emptyHtml('Classement vide', 'Participez pour apparaître au classement.', 'trophy');
  el.innerHTML = html;
}
// -- quiz (liste + jeu)
async function renderQuiz() {
  view.innerHTML = `<h1 class="view-title">Quiz</h1><p class="view-sub">Testez vos connaissances sur le basket guinéen.</p><div id="qzBody">${loadingHtml()}</div>`;
  const [quizzes, attempts] = await Promise.all([safe(listQuizzes(), null), session ? safe(listMyAttempts(), []) : Promise.resolve([])]);
  const el = $('#qzBody');
  if (quizzes === null) return void (el.innerHTML = errorHtml());
  const active = quizzes.filter((q) => q.is_active);
  if (!active.length) return void (el.innerHTML = emptyHtml('Aucun quiz', 'Les quiz de la fédération apparaîtront ici.', 'news'));
  const done = {};
  attempts.forEach((a) => { done[a.quiz_id] = a; });
  el.innerHTML = `<div class="roster">${active.map((q) => {
    const a = done[q.id];
    return `<a class="roster-row" href="#quiz/${q.id}"><span class="plus-ic" style="width:40px;height:40px;border-radius:11px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/></svg></span><span class="rr-name">${esc(q.title)}${q.description ? `<span style="display:block;color:var(--dim);font-size:12.5px">${esc(q.description)}</span>` : ''}</span><span class="rr-pos">${a ? `${a.score}/${a.total}` : 'Jouer →'}</span></a>`;
  }).join('')}</div>`;
}
async function renderQuizDetail(id) {
  view.innerHTML = backBtnHtml() + loadingHtml(); wireBack(); window.scrollTo({ top: 0 });
  const [quiz, questions] = await Promise.all([safe(getQuiz(id), null), safe(listQuizQuestionsPublic(id), [])]);
  if (!quiz) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  if (!session) {
    view.innerHTML = backBtnHtml() + `<div class="login-prompt"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/></svg></div><h3>${esc(quiz.title)}</h3><p>Connectez-vous pour jouer et gagner des points.</p><button class="btn" id="qzLogin">Se connecter</button></div>`;
    wireBack(); $('#qzLogin').addEventListener('click', () => openAuth('login')); return;
  }
  if (!questions.length) { view.innerHTML = backBtnHtml() + emptyHtml('Quiz vide', "Ce quiz n'a pas encore de questions.", 'news'); wireBack(); return; }
  const answers = {};
  let html = backBtnHtml() + `<h1 class="view-title">${esc(quiz.title)}</h1>`;
  html += questions.map((q, qi) => `<div class="quiz-q"><h3>${qi + 1}. ${esc(q.question)}</h3><div class="quiz-opts">${q.options.map((opt, oi) => `<button class="quiz-opt" data-qid="${q.id}" data-oi="${oi}">${esc(opt)}</button>`).join('')}</div></div>`).join('');
  html += `<button class="btn" id="qzSubmit" style="margin-top:10px" disabled>Valider mes réponses</button><div id="qzResult"></div>`;
  view.innerHTML = html; wireBack();
  const total = questions.length;
  view.querySelectorAll('.quiz-opt').forEach((b) => b.addEventListener('click', () => {
    const qid = b.dataset.qid;
    view.querySelectorAll(`.quiz-opt[data-qid="${qid}"]`).forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel'); answers[qid] = Number(b.dataset.oi);
    $('#qzSubmit').disabled = Object.keys(answers).length < total;
  }));
  $('#qzSubmit').addEventListener('click', async () => {
    $('#qzSubmit').disabled = true; $('#qzSubmit').textContent = 'Correction…';
    const res = await safe(submitQuiz(id, answers), null);
    if (!res) { toast('Correction impossible'); $('#qzSubmit').textContent = 'Valider mes réponses'; $('#qzSubmit').disabled = false; return; }
    (res.corrections || []).forEach((c) => {
      view.querySelectorAll(`.quiz-opt[data-qid="${c.question_id}"]`).forEach((x) => {
        const oi = Number(x.dataset.oi);
        if (oi === c.correct_index) x.classList.add('correct');
        else if (oi === c.chosen) x.classList.add('wrong');
        x.disabled = true;
      });
    });
    $('#qzResult').innerHTML = `<div class="quiz-score">Votre score : <b>${res.score}/${res.total}</b></div>`;
    $('#qzSubmit').style.display = 'none';
    toast(`Score : ${res.score}/${res.total}`);
  });
}

// -- officiels du match (remplit #officialsSlot)
async function fillOfficials(matchId) {
  const slot = $('#officialsSlot');
  if (!slot) return;
  const offs = await safe(listMatchOfficials(matchId), []);
  if ($('#officialsSlot') !== slot || !offs.length) return;
  slot.innerHTML = `<div class="block"><div class="block-head"><h2>Officiels</h2></div><div class="roster">${offs.map((o) => `<div class="roster-row"><span class="rr-name">${esc(o.referee?.full_name || '—')}</span><span class="rr-pos">${OFFICIAL_ROLE_LABELS[o.role] || ''}</span></div>`).join('')}</div></div>`;
}
// -- photos du match (remplit #photosSlot)
async function fillMatchPhotos(matchId) {
  const slot = $('#photosSlot');
  if (!slot) return;
  const photos = await safe(listPhotos({ matchId }), []);
  if ($('#photosSlot') !== slot || !photos.length) return;
  const urls = photos.map((p) => p.url);
  slot.innerHTML = `<div class="block"><div class="block-head"><h2>Photos</h2></div><div class="photo-grid">${photos.map((p, i) => `<button class="photo-thumb" data-i="${i}"><img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy"></button>`).join('')}</div></div>`;
  slot.querySelectorAll('.photo-thumb').forEach((b) => b.addEventListener('click', () => openLightbox(urls, Number(b.dataset.i))));
}
// -- lightbox photos
function openLightbox(urls, start) {
  let i = start;
  let ov = document.getElementById('lightbox');
  if (!ov) { ov = document.createElement('div'); ov.id = 'lightbox'; ov.className = 'lightbox'; document.body.appendChild(ov); }
  const draw = () => {
    ov.innerHTML = `<button class="lb-close" aria-label="Fermer">✕</button><button class="lb-nav lb-prev" aria-label="Précédent">‹</button><img src="${esc(urls[i])}" alt=""><button class="lb-nav lb-next" aria-label="Suivant">›</button>`;
    ov.querySelector('.lb-close').onclick = () => ov.classList.remove('open');
    ov.querySelector('.lb-prev').onclick = (e) => { e.stopPropagation(); i = (i - 1 + urls.length) % urls.length; draw(); };
    ov.querySelector('.lb-next').onclick = (e) => { e.stopPropagation(); i = (i + 1) % urls.length; draw(); };
  };
  draw();
  ov.classList.add('open');
  ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
}
// -- commentaires (match & actus) — remplit un slot donné
async function fillComments(targetType, targetId, slotSel) {
  const slot = document.querySelector(slotSel);
  if (!slot) return;
  const comments = (await safe(listComments(targetType, targetId), [])).filter((c) => c.status === 'visible');
  if (document.querySelector(slotSel) !== slot) return;
  const uid = session?.user?.id;
  let html = `<div class="block"><div class="block-head"><h2>Commentaires${comments.length ? ` (${comments.length})` : ''}</h2></div>`;
  if (uid) html += `<div class="comment-form"><textarea id="cmtInput" maxlength="1000" rows="2" placeholder="Votre commentaire…"></textarea><button class="btn sm" id="cmtSend">Publier</button></div>`;
  else html += `<button class="btn ghost sm" id="cmtLogin" style="margin-bottom:14px">Connectez-vous pour commenter</button>`;
  html += comments.length ? `<div class="comments">${comments.map((c) => `<div class="comment"><div class="comment-head"><b>${esc(c.author_name || 'Supporter')}</b><span>${timeAgoShort(c.created_at)}</span></div><div class="comment-body">${esc(c.body)}</div></div>`).join('')}</div>` : `<p class="view-sub" style="padding-top:4px">Soyez le premier à commenter.</p>`;
  html += `</div>`;
  slot.innerHTML = html;
  if (uid) {
    $('#cmtSend')?.addEventListener('click', async () => {
      const t = $('#cmtInput'); const body = t.value.trim(); if (!body) return;
      $('#cmtSend').disabled = true;
      try { await addComment(targetType, targetId, uid, body); t.value = ''; toast('Commentaire publié'); fillComments(targetType, targetId, slotSel); }
      catch (e) { toast(errMsg(e)); $('#cmtSend').disabled = false; }
    });
  } else $('#cmtLogin')?.addEventListener('click', () => openAuth('login'));
}
// -- chat en direct (match) — remplit #chatSlot + temps réel
let chatChannel = null;
function teardownChat() { if (chatChannel) { try { sb.removeChannel(chatChannel); } catch {} chatChannel = null; } }
function chatMsgHtml(m) { return `<div class="chat-msg"><b>${esc(m.author_name || 'Supporter')}</b> ${esc(m.body)}</div>`; }
async function fillChat(matchId) {
  const slot = $('#chatSlot');
  if (!slot) return;
  const msgs = (await safe(listChatMessages(matchId, 60), [])).filter((m) => m.status === 'visible');
  if ($('#chatSlot') !== slot) return;
  const uid = session?.user?.id;
  const list = msgs.slice().reverse();
  slot.innerHTML = `<div class="block"><div class="block-head"><h2>Chat en direct</h2></div>
    <div class="chat" id="chatList">${list.map(chatMsgHtml).join('') || '<p class="view-sub" style="padding:8px 2px">Aucun message. Lancez la discussion !</p>'}</div>
    ${uid ? `<div class="comment-form"><input id="chatInput" maxlength="300" placeholder="Votre message…" /><button class="btn sm" id="chatSend">Envoyer</button></div>` : `<button class="btn ghost sm" id="chatLogin" style="margin-top:10px">Connectez-vous pour discuter</button>`}
  </div>`;
  const listEl = $('#chatList'); if (listEl) listEl.scrollTop = listEl.scrollHeight;
  if (uid) {
    const send = async () => { const inp = $('#chatInput'); const body = inp.value.trim(); if (!body) return; inp.value = ''; try { await sendChatMessage(matchId, uid, body); } catch (e) { toast(errMsg(e)); } };
    $('#chatSend')?.addEventListener('click', send);
    $('#chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  } else $('#chatLogin')?.addEventListener('click', () => openAuth('login'));
  teardownChat();
  try {
    chatChannel = sb.channel('chat-' + matchId + '-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'match_id=eq.' + matchId }, (payload) => {
        const el = $('#chatList'); if (!el) return;
        const m = payload.new; if (m.status && m.status !== 'visible') return;
        const ph = el.querySelector('.view-sub'); if (ph) el.innerHTML = '';
        el.insertAdjacentHTML('beforeend', chatMsgHtml(m)); el.scrollTop = el.scrollHeight;
      }).subscribe();
  } catch {}
}
// -- photos (galeries)
async function renderPhotos() {
  view.innerHTML = `<h1 class="view-title">Photos</h1><p class="view-sub">Galeries de la fédération.</p><div id="phBody">${loadingHtml()}</div>`;
  const albums = await safe(listAlbums(), null);
  const el = $('#phBody');
  if (albums === null) return void (el.innerHTML = errorHtml());
  if (!albums.length) return void (el.innerHTML = emptyHtml('Pas encore de photo', 'Les galeries apparaîtront ici.', 'news'));
  el.innerHTML = `<div class="news-grid">${albums.map((g, i) => {
    const title = g.kind === 'match' && g.match ? `${g.match.home_team?.name || ''} — ${g.match.away_team?.name || ''}` : (g.album || 'Album');
    return `<button class="news-card gallery-card" data-i="${i}"><div class="news-cover">${g.cover ? `<img src="${esc(g.cover)}" alt="">` : ''}</div><div class="news-body"><h3>${esc(title)}</h3><span class="date">${g.count} photo${g.count > 1 ? 's' : ''}</span></div></button>`;
  }).join('')}</div>`;
  el.querySelectorAll('.gallery-card').forEach((b) => b.addEventListener('click', async () => {
    const g = albums[Number(b.dataset.i)];
    const photos = await safe(listPhotos(g.matchId ? { matchId: g.matchId } : { album: g.album }), []);
    if (photos.length) openLightbox(photos.map((p) => p.url), 0);
  }));
}

// ------------------------------------------------------- espace admin (fédération)
function isAdmin() { return !!(session && profile && profile.role === 'admin'); }
function adminBackHtml() {
  return `<a class="back-btn" href="#admin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Espace fédération</a>`;
}
function renderAdminDenied() {
  view.innerHTML = `<div class="login-prompt"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></div><h3>Accès réservé</h3><p>Cet espace est réservé à l'administration de la fédération.</p><button class="btn" id="admLogin">Se connecter</button></div>`;
  $('#admLogin')?.addEventListener('click', () => openAuth('login'));
}
function renderAdmin() {
  if (!isAdmin()) return renderAdminDenied();
  const items = [
    { r: 'admin-teams', label: 'Clubs', ic: '<path d="M12 3l7 3v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z"/>' },
    { r: 'admin-registrations', label: 'Inscriptions', ic: '<path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8"/><path d="M9 12l2.5 2.5L21 5"/>' },
    { r: 'admin-players', label: 'Joueurs', ic: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/>' },
    { r: 'admin-competitions', label: 'Compétitions', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'admin-matches', label: 'Matchs', ic: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>' },
    { r: 'admin-poules', label: 'Poules', ic: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0112 0M14 20a5 5 0 017-4.5"/>' },
    { r: 'admin-playoffs', label: 'Playoffs', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'admin-news', label: 'Actualités', ic: '<path d="M4 5h16v14H4zM4 9h16M9 5v14"/>' },
    { r: 'admin-media', label: 'Médias', ic: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>' },
    { r: 'admin-events', label: 'Agenda', ic: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>' },
    { r: 'admin-sponsors', label: 'Sponsors', ic: '<path d="M3 7h18v12H3z"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>' },
    { r: 'admin-awards', label: 'Palmarès', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'admin-polls', label: 'Sondages', ic: '<path d="M6 20v-6M12 20V4M18 20v-9"/><path d="M3 20h18"/>' },
    { r: 'admin-referees', label: 'Arbitres', ic: '<circle cx="10" cy="13" r="5"/><path d="M14 11l7-3-1.2 4.2"/>' },
    { r: 'admin-sanctions', label: 'Discipline', ic: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>' },
    { r: 'admin-licenses', label: 'Licences', ic: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h5"/>' },
    { r: 'admin-transfers', label: 'Transferts', ic: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
    { r: 'admin-seasons', label: 'Saisons', ic: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M8 14h3"/>' },
    { r: 'admin-quizzes', label: 'Quiz', ic: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.5a2.8 2.8 0 015.4 1c0 1.8-2.6 2-2.6 3.5M12 17.5v.4"/>' },
    { r: 'admin-moderation', label: 'Modération', ic: '<path d="M12 3l7 3v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>' },
    { r: 'admin-club-members', label: 'Responsables clubs', ic: '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5"/>' },
    { r: 'admin-club-messages', label: 'Messages clubs', ic: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
    { r: 'admin-bans', label: 'Bannissements', ic: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>' },
    { r: 'admin-socials', label: 'Réseaux sociaux', ic: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>' },
    { r: 'admin-roles', label: 'Comptes & rôles', ic: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0111 0"/><path d="M16 4a3 3 0 010 6M16.5 14.5a5.5 5.5 0 013.5 5.5"/>' },
  ];
  view.innerHTML = `<h1 class="view-title">Espace fédération</h1><p class="view-sub">Gérez les clubs, les joueurs, les compétitions, les poules, les playoffs et les réseaux sociaux.</p><div class="plus-grid">${items.map((it) => `<a class="plus-card" href="#${it.r}"><span class="plus-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.ic}</svg></span><b>${it.label}</b></a>`).join('')}</div>`;
}
let adminComp;
async function renderAdminPoules() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Poules</h1><p class="view-sub">Affectez chaque équipe à une poule. L'enregistrement est automatique.</p><div id="apFilter"></div><div id="apBody">${loadingHtml()}</div>`;
  const comps = await safe(listCompetitions(), []);
  if (!comps.length) { $('#apBody').innerHTML = emptyHtml('Aucune compétition', "Créez d'abord une compétition dans l'app mobile.", 'inbox'); return; }
  if (!adminComp || !comps.find((c) => c.id === adminComp)) adminComp = comps[0].id;
  const f = $('#apFilter');
  f.className = 'segmented';
  f.innerHTML = comps.map((c) => `<button class="seg ${adminComp === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  f.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { adminComp = b.dataset.c; renderAdminPoules(); }));
  const [teams, assigned] = await Promise.all([safe(listTeams(), []), safe(listCompetitionTeams(adminComp), [])]);
  if (!teams.length) { $('#apBody').innerHTML = emptyHtml('Aucune équipe', "Ajoutez des clubs dans l'app mobile.", 'ball'); return; }
  const pouleOf = {};
  assigned.forEach((a) => { pouleOf[a.team_id] = a.poule || ''; });
  const poules = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
  $('#apBody').innerHTML = `<div class="roster">${teams.map((t) => `<div class="roster-row admin-row">${logoHtml(t)}<span class="rr-name">${esc(t.name)}</span><select class="poule-select" data-team="${t.id}">${poules.map((p) => `<option value="${p}" ${pouleOf[t.id] === p ? 'selected' : ''}>${p === '' ? '— Aucune —' : 'Poule ' + p}</option>`).join('')}</select></div>`).join('')}</div>`;
  $('#apBody').querySelectorAll('.poule-select').forEach((sel) => sel.addEventListener('change', async () => {
    const teamId = sel.dataset.team, poule = sel.value;
    sel.disabled = true;
    try {
      if (poule) await saveCompetitionTeam(adminComp, teamId, poule, null);
      else await removeCompetitionTeam(adminComp, teamId);
      toast('Enregistré');
    } catch (e) { toast(errMsg(e)); }
    sel.disabled = false;
  }));
}

let adminSocialMode = 'federation';
let adminSocialTeam = '';
let adminSocialPlayer = '';
function socialFormHtml(fields, obj) {
  return `<form class="social-form">${fields.map(([k, label]) => `<div class="field"><label>${label}</label><input name="${k}" value="${esc(obj?.[k] || '')}" placeholder="https://…" autocomplete="off" /></div>`).join('')}<button class="btn" type="submit">Enregistrer</button></form>`;
}
function wireSocialForm(root, saver) {
  const form = root.querySelector('.social-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    form.querySelectorAll('input').forEach((inp) => { data[inp.name] = inp.value.trim() || null; });
    const btn = form.querySelector('button');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Enregistrement…';
    try { await saver(data); toast('Réseaux sociaux enregistrés'); }
    catch (err) { toast(errMsg(err)); }
    btn.disabled = false;
    btn.textContent = orig;
  });
}
async function renderAdminSocials() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Réseaux sociaux</h1>
    <div class="segmented" id="soMode">${[['federation', 'Fédération'], ['club', 'Clubs'], ['joueur', 'Joueurs']].map(([k, l]) => `<button class="seg ${adminSocialMode === k ? 'active' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
    <div id="soBody">${loadingHtml()}</div>`;
  $('#soMode').querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { adminSocialMode = b.dataset.m; renderAdminSocials(); }));
  const body = $('#soBody');
  if (adminSocialMode === 'federation') {
    const info = await safe(getFederationInfo(), {});
    body.innerHTML = socialFormHtml([['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['x', 'X (Twitter)'], ['whatsapp', 'WhatsApp (numéro ou lien)']], info);
    wireSocialForm(body, (data) => saveFederationSocials(data));
  } else if (adminSocialMode === 'club') {
    const teams = await safe(listTeams(), []);
    body.innerHTML = `<div class="field"><label>Club</label><select id="soPick" class="cmp-select"><option value="">— Choisir un club —</option>${teams.map((t) => `<option value="${t.id}" ${adminSocialTeam === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div><div id="soForm"></div>`;
    const pick = $('#soPick');
    const load = async () => {
      adminSocialTeam = pick.value;
      if (!adminSocialTeam) return void ($('#soForm').innerHTML = '');
      const t = await safe(getTeam(adminSocialTeam), {});
      $('#soForm').innerHTML = socialFormHtml([['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['x_url', 'X (Twitter)'], ['website', 'Site web']], t);
      wireSocialForm($('#soForm'), (data) => updateTeam(adminSocialTeam, data));
    };
    pick.addEventListener('change', load);
    if (adminSocialTeam) load();
  } else {
    const players = await safe(listPlayersLite(), []);
    body.innerHTML = `<div class="field"><label>Joueur</label><select id="soPick" class="cmp-select"><option value="">— Choisir un joueur —</option>${players.map((p) => `<option value="${p.id}" ${adminSocialPlayer === p.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div><div id="soForm"></div>`;
    const pick = $('#soPick');
    const load = async () => {
      adminSocialPlayer = pick.value;
      if (!adminSocialPlayer) return void ($('#soForm').innerHTML = '');
      const p = await safe(getPlayer(adminSocialPlayer), {});
      $('#soForm').innerHTML = socialFormHtml([['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x_url', 'X (Twitter)']], p);
      wireSocialForm($('#soForm'), (data) => updatePlayer(adminSocialPlayer, data));
    };
    pick.addEventListener('change', load);
    if (adminSocialPlayer) load();
  }
}

// --- Tableau des playoffs (bracket) --------------------------------------
const PO_TROPHY = '<svg class="po-tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/></svg>';
const PO_MEDAL = '<svg class="po-mico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="6"/><path d="M8.5 8.5L6 3M15.5 8.5L18 3M9.5 3h5"/></svg>';
// Côté vainqueur d'un match terminé ('home' | 'away' | null si non joué / égalité).
function playoffWinnerSide(m) {
  if (m.status !== 'finished') return null;
  const h = m.home_score ?? 0, a = m.away_score ?? 0;
  if (h > a) return 'home';
  if (a > h) return 'away';
  return null;
}
function playoffTeamRow(team, score, isWinner, showScore) {
  return `<span class="po-team${isWinner ? ' win' : ''}">${logoHtml(team, 'po-logo')}<span class="po-nm">${esc(team?.name || 'À déterminer')}</span><span class="po-sc">${showScore ? (score ?? 0) : ''}</span></span>`;
}
// Cellule compacte du tableau : deux équipes, score, vainqueur mis en avant.
function playoffCellHtml(m) {
  const live = m.status === 'live', done = m.status === 'finished';
  const show = live || done;
  const win = playoffWinnerSide(m);
  let foot;
  if (live) foot = `<span class="po-live">EN DIRECT · Q${m.current_quarter || 1}</span>`;
  else if (done) foot = `<span class="po-foot">Terminé · ${esc(fmtDate(m.scheduled_at))}</span>`;
  else foot = `<span class="po-foot">${m.scheduled_at ? esc(relativeDayLabel(m.scheduled_at)) + ' · ' + esc(fmtTime(m.scheduled_at)) : 'À programmer'}</span>`;
  const venue = (!show && m.venue) ? `<span class="po-venue">${PIN_ICO}${esc(m.venue)}</span>` : '';
  return `<a class="po-cell${done ? ' is-done' : ''}${live ? ' is-live' : ''}" href="#match/${m.id}">
    ${playoffTeamRow(m.home_team, m.home_score, win === 'home', show)}
    ${playoffTeamRow(m.away_team, m.away_score, win === 'away', show)}
    <span class="po-cell-foot">${foot}${venue}</span>
  </a>`;
}
function playoffColumnHtml(key, list) {
  const slots = list.map((m) => `<div class="po-slot">${playoffCellHtml(m)}</div>`).join('');
  return `<div class="po-round" data-round="${esc(key)}"><div class="po-round-head">${esc(playoffRoundLabel(key))}</div><div class="po-round-body">${slots}</div></div>`;
}
// Assemble le tableau : colonnes quarts → demies → finale → champion (+ 3e place).
function playoffBracketHtml(matches) {
  const byRound = {};
  matches.forEach((m) => { const k = m.playoff_round || 'autre'; (byRound[k] = byRound[k] || []).push(m); });
  const path = ['quart', 'demi', 'finale'].filter((k) => byRound[k] && byRound[k].length);

  const finale = (byRound.finale || [])[0];
  let champ = null;
  if (finale && finale.status === 'finished') {
    const w = playoffWinnerSide(finale);
    champ = w === 'home' ? finale.home_team : w === 'away' ? finale.away_team : null;
  }

  let out = '';
  if (champ) out += `<div class="po-banner">${PO_TROPHY}<span>Champion&nbsp;— <b>${esc(champ.name)}</b></span></div>`;

  if (path.length) {
    const cols = path.map((k) => playoffColumnHtml(k, byRound[k])).join('');
    const champInner = champ
      ? `${logoHtml(champ, 'po-logo lg')}<b class="po-champ-nm">${esc(champ.name)}</b>`
      : '<span class="po-champ-tbd">À déterminer</span>';
    const champCol = `<div class="po-round po-champ-col"><div class="po-round-head">Champion</div><div class="po-round-body"><div class="po-slot"><div class="po-champ${champ ? ' is-set' : ''}">${PO_TROPHY}${champInner}</div></div></div></div>`;
    out += `<div class="po-scroll"><div class="po-bracket">${cols}${champCol}</div></div><p class="po-hint">Faites défiler horizontalement pour voir tout le tableau.</p>`;
  }

  if (byRound.petite_finale && byRound.petite_finale.length) {
    out += `<div class="po-extra"><div class="po-extra-head">${PO_MEDAL}Match pour la 3ᵉ place</div><div class="po-extra-body">${byRound.petite_finale.map(playoffCellHtml).join('')}</div></div>`;
  }
  if (byRound.autre && byRound.autre.length) {
    out += `<div class="po-extra"><div class="po-extra-head">Autres rencontres</div><div class="po-extra-body">${byRound.autre.map(playoffCellHtml).join('')}</div></div>`;
  }
  return out || emptyHtml('Playoffs à venir', 'Le tableau final apparaîtra une fois les matchs programmés.', 'trophy');
}

let poComp;
async function renderPlayoffs() {
  view.innerHTML = `<h1 class="view-title">Playoffs</h1><p class="view-sub">Le tableau final : la route vers le titre, des quarts jusqu'au sacre du champion.</p><div id="poFilter"></div><div id="poBody">${loadingHtml()}</div>`;
  const comps = await safe(listCompetitions(), []);
  if (poComp === undefined || (comps.length && !comps.find((c) => c.id === poComp))) poComp = comps.length ? comps[0].id : null;
  const f = $('#poFilter');
  if (f && comps.length > 1) {
    f.className = 'segmented';
    f.innerHTML = comps.map((c) => `<button class="seg ${poComp === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
    f.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { poComp = b.dataset.c; renderPlayoffs(); }));
  }
  const matches = await safe(listPlayoffMatches(poComp || undefined), []);
  const body = $('#poBody');
  if (!body) return;
  if (!matches.length) { body.innerHTML = emptyHtml('Playoffs à venir', 'Le tableau final apparaîtra une fois les matchs programmés.', 'trophy'); return; }
  body.innerHTML = playoffBracketHtml(matches);
  // N'afficher l'indication de défilement que si le tableau déborde réellement.
  const sc = body.querySelector('.po-scroll'), hint = body.querySelector('.po-hint');
  if (sc && hint && sc.scrollWidth > sc.clientWidth + 4) hint.style.display = 'block';
}
async function renderAdminPlayoffs() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Playoffs</h1><p class="view-sub">Programmez les matchs du tableau final.</p><div id="apoFilter"></div><div id="apoBody">${loadingHtml()}</div>`;
  const comps = await safe(listCompetitions(), []);
  if (!comps.length) { $('#apoBody').innerHTML = emptyHtml('Aucune compétition', "Créez d'abord une compétition dans l'app mobile.", 'inbox'); return; }
  if (!adminComp || !comps.find((c) => c.id === adminComp)) adminComp = comps[0].id;
  const f = $('#apoFilter');
  f.className = 'segmented';
  f.innerHTML = comps.map((c) => `<button class="seg ${adminComp === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  f.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { adminComp = b.dataset.c; renderAdminPlayoffs(); }));
  const [teams, matches] = await Promise.all([safe(listTeams(), []), safe(listPlayoffMatches(adminComp), [])]);
  const teamOpts = '<option value="">— Choisir —</option>' + teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const list = matches.length
    ? matches.map(playoffAdminRowHtml).join('')
    : '<p class="view-sub" style="padding:6px 2px">Aucun match de playoff pour l\'instant.</p>';
  $('#apoBody').innerHTML = `
    <form class="social-form" id="poForm">
      <div class="field"><label>Tour</label><select name="playoff_round">${PLAYOFF_ROUNDS.map((r) => `<option value="${r.key}">${r.label}</option>`).join('')}</select></div>
      <div class="field"><label>Équipe A (domicile)</label><select name="home_team_id" required>${teamOpts}</select></div>
      <div class="field"><label>Équipe B (extérieur)</label><select name="away_team_id" required>${teamOpts}</select></div>
      <div class="field"><label>Date et heure</label><input type="datetime-local" name="scheduled_at" /></div>
      <div class="field"><label>Salle (optionnel)</label><input name="venue" placeholder="Ex. Palais des Sports de Nongo" /></div>
      <button class="btn" type="submit">Créer le match</button>
    </form>
    <div class="block" style="margin-top:24px"><div class="block-head"><h2>Matchs programmés</h2></div><div class="roster">${list}</div></div>`;
  const form = $('#poForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const home = fd.get('home_team_id'), away = fd.get('away_team_id');
    if (!home || !away) return toast('Choisissez les deux équipes');
    if (home === away) return toast('Les deux équipes doivent être différentes');
    const dt = fd.get('scheduled_at');
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await createPlayoffMatch({ competition_id: adminComp, home_team_id: home, away_team_id: away, playoff_round: fd.get('playoff_round'), scheduled_at: dt ? dt + ':00.000Z' : null, venue: (fd.get('venue') || '').trim() || null });
      toast('Match de playoff créé');
      renderAdminPlayoffs();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  const poBackOpts = { back: renderAdminPlayoffs, backLabel: 'Playoffs' };
  $('#apoBody').querySelectorAll('[data-box]').forEach((b) => b.addEventListener('click', () => openBoxScore(b.dataset.box, poBackOpts)));
  $('#apoBody').querySelectorAll('[data-officials]').forEach((b) => b.addEventListener('click', () => openMatchOfficials(b.dataset.officials, poBackOpts)));
  $('#apoBody').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openMatchEdit(b.dataset.edit, poBackOpts)));
  $('#apoBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await deleteMatch(b.dataset.del); toast('Match supprimé'); renderAdminPlayoffs(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

let adminMatchComp = '';
function matchStatusBadge(m) {
  if (m.status === 'live') return '<span class="pill live">En direct</span>';
  if (m.status === 'finished') return '<span class="pill done">Terminé</span>';
  return `<span class="pill next">${m.scheduled_at ? fmtDate(m.scheduled_at) + ' · ' + fmtTime(m.scheduled_at) : 'À programmer'}</span>`;
}
function matchAdminActionsHtml(m) {
  return `<span class="alr-actions"><button class="mini-btn" data-box="${m.id}" aria-label="Feuille de match" title="Feuille de match"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v3H8z"/><path d="M6 4H5v16h14V4h-1M8 12h8M8 16h5"/></svg></button><button class="mini-btn" data-officials="${m.id}" aria-label="Officiels" title="Officiels"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="13" r="5"/><path d="M14 11l7-3-1.2 4.2"/></svg></button><button class="mini-btn" data-edit="${m.id}" aria-label="Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button><button class="mini-del" data-del="${m.id}" aria-label="Supprimer">✕</button></span>`;
}
function matchAdminRowHtml(m) {
  const score = (m.status === 'finished' || m.status === 'live') ? ` <b>${m.home_score ?? 0}–${m.away_score ?? 0}</b>` : '';
  const jour = m.round != null ? 'J' + esc(String(m.round)) + ' · ' : '';
  return `<div class="roster-row"><span class="rr-name">${jour}${esc(m.home_team?.name || '?')} — ${esc(m.away_team?.name || '?')}${score}<br><span class="rr-sub">${matchStatusBadge(m)}</span></span>${matchAdminActionsHtml(m)}</div>`;
}
function playoffAdminRowHtml(m) {
  const score = (m.status === 'finished' || m.status === 'live') ? ` <b>${m.home_score ?? 0}–${m.away_score ?? 0}</b>` : '';
  return `<div class="roster-row"><span class="rr-name"><b>${esc(playoffRoundLabel(m.playoff_round))}</b> · ${esc(m.home_team?.name || '?')} — ${esc(m.away_team?.name || '?')}${score}<br><span class="rr-sub">${matchStatusBadge(m)}</span></span>${matchAdminActionsHtml(m)}</div>`;
}
async function renderAdminMatches() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Matchs</h1><p class="view-sub">Programmez les matchs du championnat et saisissez les résultats.</p><div id="amFilter"></div><div id="amBody">${loadingHtml()}</div>`;
  const [comps, teams] = await Promise.all([safe(listCompetitions(), []), safe(listTeams(), [])]);
  if (!teams.length) { $('#amBody').innerHTML = emptyHtml('Aucune équipe', 'Créez d’abord des clubs dans « Clubs ».', 'ball'); return; }
  const f = $('#amFilter');
  if (comps.length) {
    f.className = 'segmented';
    f.innerHTML = `<button class="seg ${adminMatchComp === '' ? 'active' : ''}" data-c="">Tous</button>` + comps.map((c) => `<button class="seg ${adminMatchComp === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
    f.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { adminMatchComp = b.dataset.c; renderAdminMatches(); }));
  }
  const matches = await safe(listAdminMatches(adminMatchComp || undefined), []);
  const teamOpts = '<option value="">— Choisir —</option>' + teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const compOpts = '<option value="">— Amical / hors compétition —</option>' + comps.map((c) => `<option value="${c.id}" ${adminMatchComp === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const list = matches.length
    ? matches.map(matchAdminRowHtml).join('')
    : '<p class="view-sub" style="padding:6px 2px">Aucun match programmé pour l’instant.</p>';
  $('#amBody').innerHTML = `
    <form class="social-form" id="amForm">
      <div class="field"><label>Compétition</label><select name="competition_id">${compOpts}</select></div>
      <div class="field"><label>Journée (optionnel)</label><input name="round" placeholder="Ex. 1" inputmode="numeric" /></div>
      <div class="field"><label>Équipe A (domicile)</label><select name="home_team_id" required>${teamOpts}</select></div>
      <div class="field"><label>Équipe B (extérieur)</label><select name="away_team_id" required>${teamOpts}</select></div>
      <div class="field"><label>Date et heure</label><input type="datetime-local" name="scheduled_at" /></div>
      <div class="field"><label>Salle (optionnel)</label><input name="venue" placeholder="Ex. Palais des Sports de Nongo" /></div>
      <button class="btn" type="submit">Programmer le match</button>
    </form>
    <div class="block" style="margin-top:24px"><div class="block-head"><h2>Matchs programmés</h2></div><div class="roster">${list}</div></div>`;
  const form = $('#amForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const home = fd.get('home_team_id'), away = fd.get('away_team_id');
    if (!home || !away) return toast('Choisissez les deux équipes');
    if (home === away) return toast('Les deux équipes doivent être différentes');
    const dt = fd.get('scheduled_at');
    const rn = parseInt(fd.get('round'), 10);
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      await scheduleMatch({ competition_id: fd.get('competition_id') || null, home_team_id: home, away_team_id: away, scheduled_at: dt ? dt + ':00.000Z' : null, venue: (fd.get('venue') || '').trim() || null, round: Number.isFinite(rn) ? rn : null });
      toast('Match programmé');
      renderAdminMatches();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#amBody').querySelectorAll('[data-box]').forEach((b) => b.addEventListener('click', () => openBoxScore(b.dataset.box)));
  $('#amBody').querySelectorAll('[data-officials]').forEach((b) => b.addEventListener('click', () => openMatchOfficials(b.dataset.officials)));
  $('#amBody').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openMatchEdit(b.dataset.edit)));
  $('#amBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!window.confirm('Supprimer ce match ?')) return;
    b.disabled = true;
    try { await deleteMatch(b.dataset.del); toast('Match supprimé'); renderAdminMatches(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}
async function openMatchEdit(id, opts = {}) {
  if (!isAdmin()) return renderAdminDenied();
  const backFn = opts.back || renderAdminMatches;
  const backLabel = opts.backLabel || 'Matchs';
  view.innerHTML = adminBackHtml() + loadingHtml();
  const [m, teams] = await Promise.all([safe(getMatch(id), null), safe(listTeams(), [])]);
  if (!m) { view.innerHTML = adminBackHtml() + errorHtml(); return; }
  const teamOpts = (sel) => teams.map((t) => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const dtLocal = m.scheduled_at ? m.scheduled_at.slice(0, 16) : '';
  const STATUSES = [['scheduled', 'À venir'], ['live', 'En direct'], ['finished', 'Terminé']];
  view.innerHTML = `
    <a class="back-btn" id="amBack" role="button" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>${esc(backLabel)}</a>
    <h1 class="view-title">Modifier le match</h1>
    <form class="admin-form" id="amEdit" novalidate>
      <div class="field"><label>Journée (optionnel)</label><input name="round" value="${m.round != null ? esc(String(m.round)) : ''}" inputmode="numeric" placeholder="Ex. 1" /></div>
      <div class="field"><label>Équipe A (domicile)</label><select name="home_team_id" required>${teamOpts(m.home_team_id)}</select></div>
      <div class="field"><label>Équipe B (extérieur)</label><select name="away_team_id" required>${teamOpts(m.away_team_id)}</select></div>
      <div class="field"><label>Date et heure</label><input type="datetime-local" name="scheduled_at" value="${esc(dtLocal)}" /></div>
      <div class="field"><label>Salle</label><input name="venue" value="${esc(m.venue || '')}" placeholder="Ex. Palais des Sports de Nongo" /></div>
      <div class="field"><label>Statut</label><select name="status">${STATUSES.map(([v, l]) => `<option value="${v}" ${m.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="score-row">
        <div class="field"><label>Score ${esc(m.home_team?.short_name || m.home_team?.name || 'A')}</label><input type="number" min="0" name="home_score" value="${m.home_score ?? 0}" /></div>
        <div class="field"><label>Score ${esc(m.away_team?.short_name || m.away_team?.name || 'B')}</label><input type="number" min="0" name="away_score" value="${m.away_score ?? 0}" /></div>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" id="amCancel">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`;
  const back = backFn;
  $('#amBack').addEventListener('click', back);
  $('#amBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); back(); } });
  $('#amCancel').addEventListener('click', back);
  const form = $('#amEdit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const home = fd.get('home_team_id'), away = fd.get('away_team_id');
    if (home === away) return toast('Les deux équipes doivent être différentes');
    const dt = fd.get('scheduled_at');
    const rn = parseInt(fd.get('round'), 10);
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await updateMatch(id, {
        home_team_id: home,
        away_team_id: away,
        round: Number.isFinite(rn) ? rn : null,
        scheduled_at: dt ? dt + ':00.000Z' : null,
        venue: (fd.get('venue') || '').trim() || null,
        status: fd.get('status'),
        home_score: parseInt(fd.get('home_score'), 10) || 0,
        away_score: parseInt(fd.get('away_score'), 10) || 0,
      });
      toast('Match mis à jour');
      backFn();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
}

// --- Feuille de match (box score) ---
async function listTeamPlayers(teamId) {
  const { data, error } = await sb.from('players').select('id, full_name, number').eq('team_id', teamId).order('number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
async function getMatchBoxScore(matchId) {
  const { data, error } = await sb.from('player_match_stats').select('*').eq('match_id', matchId);
  if (error) throw error;
  return data ?? [];
}
async function saveBoxScore(rows) {
  const { error } = await sb.from('player_match_stats').upsert(rows, { onConflict: 'match_id,player_id' });
  if (error) throw error;
}
const BOX_COLS = [['minutes', 'MIN'], ['points', 'PTS'], ['rebounds', 'REB'], ['off_rebounds', 'REB.O'], ['assists', 'PD'], ['steals', 'INT'], ['blocks', 'CT'], ['turnovers', 'BP'], ['fouls', 'FTE'], ['fg_made', 'TM'], ['fg_att', 'TT'], ['three_made', '3M'], ['three_att', '3T'], ['ft_made', 'LFM'], ['ft_att', 'LFT'], ['plus_minus', '+/-']];
function boxTeamHtml(team, players, byPlayer) {
  if (!players.length) return `<div class="block"><div class="block-head"><h2>${esc(team?.name || '')}</h2></div><p class="view-sub" style="padding:6px 2px">Aucun joueur dans cette équipe (ajoutez-les dans « Joueurs »).</p></div>`;
  const rows = players.map((p) => {
    const s = byPlayer[p.id] || {};
    const num = p.number != null ? `<b>${esc(String(p.number))}</b> ` : '';
    return `<tr><td class="bs-name">${num}${esc(p.full_name)}</td>${BOX_COLS.map(([k]) => `<td><input type="number" inputmode="numeric" data-player="${p.id}" data-stat="${k}" value="${s[k] ?? 0}"/></td>`).join('')}</tr>`;
  }).join('');
  return `<div class="block"><div class="block-head"><h2>${esc(team?.name || '')}</h2></div>
    <div class="boxscore-wrap"><table class="boxscore"><thead><tr><th class="bs-name">Joueur</th>${BOX_COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
async function openBoxScore(matchId, opts = {}) {
  if (!isAdmin()) return renderAdminDenied();
  const backFn = opts.back || renderAdminMatches;
  const backLabel = opts.backLabel || 'Matchs';
  view.innerHTML = adminBackHtml() + loadingHtml();
  const m = await safe(getMatch(matchId), null);
  if (!m) { view.innerHTML = adminBackHtml() + errorHtml(); return; }
  const [homeP, awayP, stats] = await Promise.all([
    safe(listTeamPlayers(m.home_team_id), []),
    safe(listTeamPlayers(m.away_team_id), []),
    safe(getMatchBoxScore(matchId), []),
  ]);
  const byPlayer = {};
  stats.forEach((s) => { byPlayer[s.player_id] = s; });
  const teamOf = {};
  homeP.forEach((p) => { teamOf[p.id] = m.home_team_id; });
  awayP.forEach((p) => { teamOf[p.id] = m.away_team_id; });
  view.innerHTML = `
    <a class="back-btn" id="bsBack" role="button" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>${esc(backLabel)}</a>
    <h1 class="view-title">Feuille de match</h1>
    <p class="view-sub">${esc(m.home_team?.name || '?')} — ${esc(m.away_team?.name || '?')}${m.status === 'finished' ? ` · ${m.home_score}–${m.away_score}` : ''}. Saisissez les statistiques par joueur, puis enregistrez.</p>
    ${boxTeamHtml(m.home_team, homeP, byPlayer)}
    ${boxTeamHtml(m.away_team, awayP, byPlayer)}
    <div class="form-actions"><button class="btn btn-ghost" id="bsBack2" type="button">Retour</button><button class="btn" id="bsSave" type="button">Enregistrer la feuille</button></div>`;
  const back = backFn;
  $('#bsBack').addEventListener('click', back);
  $('#bsBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); back(); } });
  $('#bsBack2').addEventListener('click', back);
  $('#bsSave').addEventListener('click', async () => {
    const players = [...homeP, ...awayP];
    const rows = [];
    players.forEach((p) => {
      const row = { match_id: matchId, player_id: p.id, team_id: teamOf[p.id] };
      let has = false;
      BOX_COLS.forEach(([k]) => {
        const el = view.querySelector(`input[data-player="${p.id}"][data-stat="${k}"]`);
        const v = el ? (parseInt(el.value, 10) || 0) : 0;
        row[k] = v; if (v) has = true;
      });
      if (has || byPlayer[p.id]) rows.push(row);
    });
    if (!rows.length) return toast('Aucune statistique à enregistrer');
    const btn = $('#bsSave'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enregistrement…';
    try { await saveBoxScore(rows); toast('Feuille de match enregistrée'); }
    catch (e) { toast(errMsg(e)); }
    btn.disabled = false; btn.textContent = orig;
  });
}

// --------------------------------------------------------------- CRUD admin générique
const POSITIONS = ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'];
const COMP_TYPES = [
  { value: 'championnat', label: 'Championnat' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'tournoi', label: 'Tournoi' },
];
const COMP_CATEGORIES = [
  { value: 'messieurs', label: 'Messieurs' },
  { value: 'dames', label: 'Dames' },
  { value: 'mixte', label: 'Mixte' },
];
// Genre d'une équipe : choix binaire masculine (messieurs) / féminine (dames).
// Sous-ensemble du vocabulaire de la catégorie des compétitions (sans « mixte »,
// une équipe étant l'un ou l'autre) — la contrainte CHECK en base est alignée.
const TEAM_GENDERS = [
  { value: 'messieurs', label: 'Masculine' },
  { value: 'dames', label: 'Féminine' },
];
function labelOf(list, v) { return (list.find((o) => o.value === v) || {}).label || v || ''; }

// Helpers CRUD génériques (une table = une ligne).
function crudList(table, opts) {
  const o = opts || {};
  return async () => {
    const { data, error } = await sb.from(table).select(o.select || '*').order(o.orderBy || 'created_at', { ascending: o.asc || false, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  };
}
function crudCreate(table) { return async (patch) => { const { error } = await sb.from(table).insert(patch); if (error) throw error; }; }
function crudUpdate(table) { return async (id, patch) => { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error; }; }
function crudRemove(table) { return async (id) => { const { error } = await sb.from(table).delete().eq('id', id); if (error) throw error; }; }
async function listSeasons() { const { data, error } = await sb.from('seasons').select('id, name').order('start_date', { ascending: false, nullsFirst: false }); if (error) throw error; return data ?? []; }
const optsFrom = (rows, valueKey, labelKey) => rows.map((r) => ({ value: r[valueKey], label: r[labelKey] }));

const CRUD_TEAMS = {
  title: 'Clubs',
  sub: 'Ajoutez, modifiez ou supprimez les clubs et sélections.',
  singular: 'Club',
  emptyIcon: 'ball',
  emptyTitle: 'Aucun club',
  emptySub: 'Créez le premier club avec le bouton « Ajouter ».',
  list: () => listTeams(),
  create: (patch) => createTeam(patch),
  update: (id, patch) => updateTeam(id, patch),
  remove: (id) => deleteTeam(id),
  thumb: (t) => logoHtml(t),
  itemTitle: (t) => t.name,
  itemSub: (t) => [t.short_name, labelOf(TEAM_GENDERS, t.gender), t.city, t.division].filter(Boolean).join(' · '),
  fields: [
    { k: 'name', label: 'Nom du club', type: 'text', required: true, placeholder: 'Ex. Tout Sport de Kaloum' },
    { k: 'short_name', label: 'Sigle', type: 'text', placeholder: 'Ex. TSK' },
    { k: 'gender', label: 'Genre de l’équipe', type: 'select', emptyLabel: '— Non précisé —', options: TEAM_GENDERS },
    { k: 'city', label: 'Ville', type: 'text', placeholder: 'Ex. Conakry' },
    { k: 'division', label: 'Division', type: 'text', placeholder: 'Ex. D1' },
    { k: 'coach', label: 'Entraîneur', type: 'text' },
    { k: 'founded_year', label: 'Année de création', type: 'number', placeholder: 'Ex. 1975' },
    { k: 'color', label: 'Couleur du club', type: 'color', default: '#1C3F8F' },
    { k: 'logo_url', label: 'Logo', type: 'image', folder: 'teams' },
    { k: 'is_national', label: 'Équipe nationale (sélection)', type: 'checkbox' },
  ],
};

const CRUD_PLAYERS = {
  title: 'Joueurs',
  sub: 'Ajoutez, modifiez ou supprimez les fiches joueurs.',
  singular: 'Joueur',
  emptyIcon: 'ball',
  emptyTitle: 'Aucun joueur',
  emptySub: 'Créez le premier joueur avec le bouton « Ajouter ».',
  list: () => listAdminPlayers(),
  create: (patch) => createPlayer(patch),
  update: (id, patch) => updatePlayer(id, patch),
  remove: (id) => deletePlayer(id),
  thumb: (p) => p.photo_url
    ? `<span class="mlogo"><img src="${esc(p.photo_url)}" alt="" loading="lazy"></span>`
    : `<span class="mlogo" style="background:var(--teal)">${esc(initials(p.full_name))}</span>`,
  itemTitle: (p) => p.full_name,
  itemSub: (p) => [p.team && p.team.name, p.position, p.number != null ? '#' + p.number : ''].filter(Boolean).join(' · '),
  formContext: async () => ({ teams: await safe(listTeams(), []) }),
  fields: (ctx) => [
    { k: 'full_name', label: 'Nom complet', type: 'text', required: true },
    { k: 'team_id', label: 'Club', type: 'select', emptyLabel: '— Sans club —', options: ctx.teams.map((t) => ({ value: t.id, label: t.name })) },
    { k: 'number', label: 'Numéro', type: 'number', placeholder: 'Ex. 7' },
    { k: 'position', label: 'Poste', type: 'select', emptyLabel: '— Non précisé —', options: POSITIONS.map((p) => ({ value: p, label: p })) },
    { k: 'height_cm', label: 'Taille (cm)', type: 'number', placeholder: 'Ex. 190' },
    { k: 'birth_date', label: 'Date de naissance', type: 'date' },
    { k: 'nationality', label: 'Nationalité', type: 'text', default: 'Guinéenne' },
    { k: 'photo_url', label: 'Photo', type: 'image', folder: 'players' },
  ],
};

const CRUD_COMPS = {
  title: 'Compétitions',
  sub: 'Créez et gérez les championnats, coupes et tournois.',
  singular: 'Compétition',
  emptyIcon: 'trophy',
  emptyTitle: 'Aucune compétition',
  emptySub: 'Créez la première compétition avec le bouton « Ajouter ».',
  list: () => listCompetitions(),
  create: (patch) => createCompetition(patch),
  update: (id, patch) => updateCompetition(id, patch),
  remove: (id) => deleteCompetition(id),
  itemTitle: (c) => c.name,
  itemSub: (c) => [labelOf(COMP_TYPES, c.type), labelOf(COMP_CATEGORIES, c.category), c.season].filter(Boolean).join(' · '),
  fields: [
    { k: 'name', label: 'Nom de la compétition', type: 'text', required: true, placeholder: 'Ex. Championnat National D1 — Messieurs' },
    { k: 'type', label: 'Type', type: 'select', required: true, default: 'championnat', options: COMP_TYPES },
    { k: 'category', label: 'Catégorie', type: 'select', required: true, default: 'messieurs', options: COMP_CATEGORIES },
    { k: 'season', label: 'Saison', type: 'text', placeholder: 'Ex. 2025-2026' },
    { k: 'format', label: 'Format', type: 'text', placeholder: 'Ex. Poules + playoffs' },
  ],
};

// --- Configs CRUD supplémentaires (portage admin complet) ---
const NEWS_CATS = [{ value: 'officiel', label: 'Officiel' }, { value: 'communiqué', label: 'Communiqué' }, { value: 'compétition', label: 'Compétition' }, { value: 'interview', label: 'Interview' }];
const SPONSOR_TIERS = [{ value: 'principal', label: 'Sponsor principal' }, { value: 'officiel', label: 'Sponsor officiel' }, { value: 'partenaire', label: 'Partenaire' }, { value: 'media', label: 'Partenaire média' }];
const SPONSOR_PLACEMENTS = [{ value: 'tous', label: 'Partout' }, { value: 'accueil', label: 'Accueil' }, { value: 'apropos', label: 'À propos' }, { value: 'matchs', label: 'Matchs' }];
const REF_LEVELS = [{ value: 'regional', label: 'Régional' }, { value: 'national', label: 'National' }, { value: 'international', label: 'International' }];
const AWARD_KINDS = [{ value: 'champion', label: 'Champion' }, { value: 'vainqueur_coupe', label: 'Vainqueur de coupe' }, { value: 'mvp', label: 'MVP' }, { value: 'meilleur_marqueur', label: 'Meilleur marqueur' }, { value: 'meilleur_espoir', label: 'Meilleur espoir' }, { value: 'meilleur_defenseur', label: 'Meilleur défenseur' }];
const SANCTION_KINDS = [{ value: 'avertissement', label: 'Avertissement' }, { value: 'suspension', label: 'Suspension' }, { value: 'amende', label: 'Amende' }, { value: 'exclusion', label: 'Exclusion' }];
const SANCTION_STATUS = [{ value: 'active', label: 'Active' }, { value: 'purgee', label: 'Purgée' }, { value: 'annulee', label: 'Annulée' }];
const AD_MEDIA_KINDS = [{ value: 'interview', label: 'Interview' }, { value: 'podcast', label: 'Podcast' }, { value: 'reportage', label: 'Reportage' }, { value: 'video', label: 'Vidéo' }];
const EVENT_CATS = [{ value: 'federation', label: 'Fédération' }, { value: 'competition', label: 'Compétition' }, { value: 'formation', label: 'Formation' }, { value: 'ceremonie', label: 'Cérémonie' }];
const LICENSE_STATUS = [{ value: 'pending', label: 'En attente' }, { value: 'valid', label: 'Validée' }, { value: 'expired', label: 'Expirée' }, { value: 'suspended', label: 'Suspendue' }];
const TRANSFER_STATUS = [{ value: 'pending', label: 'En attente' }, { value: 'approved', label: 'Approuvé' }, { value: 'rejected', label: 'Refusé' }];

const CRUD_NEWS = {
  title: 'Actualités', singular: 'Actualité', emptyIcon: 'news', emptyTitle: 'Aucune actualité', emptySub: 'Publiez la première actualité.',
  list: crudList('news', { orderBy: 'published_at' }), create: crudCreate('news'), update: crudUpdate('news'), remove: crudRemove('news'),
  thumb: (n) => n.cover_url ? `<span class="mlogo"><img src="${esc(n.cover_url)}" alt="" loading="lazy"></span>` : '',
  itemTitle: (n) => n.title, itemSub: (n) => [labelOf(NEWS_CATS, n.category), n.published_at ? fmtDate(n.published_at) : ''].filter(Boolean).join(' · '),
  fields: [
    { k: 'title', label: 'Titre', type: 'text', required: true },
    { k: 'category', label: 'Catégorie', type: 'select', default: 'officiel', options: NEWS_CATS },
    { k: 'body', label: 'Contenu', type: 'textarea', rows: 8 },
    { k: 'author', label: 'Auteur', type: 'text', placeholder: 'Ex. Service communication FGBB' },
    { k: 'cover_url', label: 'Image de couverture', type: 'image', folder: 'news' },
    { k: 'published_at', label: 'Date de publication', type: 'datetime', omitEmpty: true },
  ],
};
const CRUD_SPONSORS = {
  title: 'Sponsors', singular: 'Sponsor', emptyTitle: 'Aucun sponsor',
  list: crudList('sponsors', { orderBy: 'position', asc: true }), create: crudCreate('sponsors'), update: crudUpdate('sponsors'), remove: crudRemove('sponsors'),
  thumb: (s) => s.logo_url ? `<span class="mlogo"><img src="${esc(s.logo_url)}" alt="" loading="lazy"></span>` : '',
  itemTitle: (s) => s.name, itemSub: (s) => [labelOf(SPONSOR_TIERS, s.tier), s.is_active ? '' : 'inactif'].filter(Boolean).join(' · '),
  fields: [
    { k: 'name', label: 'Nom', type: 'text', required: true },
    { k: 'logo_url', label: 'Logo', type: 'image', folder: 'sponsors' },
    { k: 'url', label: 'Site web', type: 'text', placeholder: 'https://…' },
    { k: 'tier', label: 'Niveau', type: 'select', default: 'partenaire', options: SPONSOR_TIERS },
    { k: 'placement', label: 'Emplacement', type: 'select', default: 'tous', options: SPONSOR_PLACEMENTS },
    { k: 'position', label: 'Ordre d’affichage', type: 'number', omitEmpty: true, placeholder: '0' },
    { k: 'is_active', label: 'Actif', type: 'checkbox', default: true },
  ],
};
const CRUD_REFEREES = {
  title: 'Arbitres', singular: 'Arbitre', emptyTitle: 'Aucun arbitre',
  list: crudList('referees', { orderBy: 'full_name', asc: true }), create: crudCreate('referees'), update: crudUpdate('referees'), remove: crudRemove('referees'),
  thumb: (r) => r.photo_url ? `<span class="mlogo"><img src="${esc(r.photo_url)}" alt="" loading="lazy"></span>` : `<span class="mlogo" style="background:var(--teal)">${esc(initials(r.full_name))}</span>`,
  itemTitle: (r) => r.full_name, itemSub: (r) => [labelOf(REF_LEVELS, r.level), r.city, r.is_active ? '' : 'inactif'].filter(Boolean).join(' · '),
  fields: [
    { k: 'full_name', label: 'Nom complet', type: 'text', required: true },
    { k: 'city', label: 'Ville', type: 'text' },
    { k: 'level', label: 'Niveau', type: 'select', default: 'regional', options: REF_LEVELS },
    { k: 'license_number', label: 'N° de licence', type: 'text' },
    { k: 'photo_url', label: 'Photo', type: 'image', folder: 'referees' },
    { k: 'is_active', label: 'Actif', type: 'checkbox', default: true },
  ],
};
const CRUD_SEASONS = {
  title: 'Saisons', singular: 'Saison', emptyTitle: 'Aucune saison',
  list: crudList('seasons', { orderBy: 'start_date' }), create: crudCreate('seasons'), update: crudUpdate('seasons'), remove: crudRemove('seasons'),
  itemTitle: (s) => s.name, itemSub: (s) => [s.start_date, s.is_current ? 'en cours' : ''].filter(Boolean).join(' · '),
  fields: [
    { k: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'Ex. 2026-2027' },
    { k: 'start_date', label: 'Début', type: 'date' },
    { k: 'end_date', label: 'Fin', type: 'date' },
    { k: 'is_current', label: 'Saison en cours', type: 'checkbox' },
  ],
};
const CRUD_EVENTS = {
  title: 'Agenda', singular: 'Événement', emptyTitle: 'Aucun événement',
  list: crudList('events', { orderBy: 'starts_at' }), create: crudCreate('events'), update: crudUpdate('events'), remove: crudRemove('events'),
  thumb: (e) => e.cover_url ? `<span class="mlogo"><img src="${esc(e.cover_url)}" alt="" loading="lazy"></span>` : '',
  itemTitle: (e) => e.title, itemSub: (e) => [e.starts_at ? fmtDate(e.starts_at) : '', e.location].filter(Boolean).join(' · '),
  fields: [
    { k: 'title', label: 'Titre', type: 'text', required: true },
    { k: 'category', label: 'Catégorie', type: 'select', default: 'federation', options: EVENT_CATS },
    { k: 'description', label: 'Description', type: 'textarea', rows: 4 },
    { k: 'starts_at', label: 'Début', type: 'datetime', required: true },
    { k: 'ends_at', label: 'Fin (optionnel)', type: 'datetime' },
    { k: 'location', label: 'Lieu', type: 'text' },
    { k: 'cover_url', label: 'Image', type: 'image', folder: 'events' },
  ],
};
const CRUD_MEDIA = {
  title: 'Médias', singular: 'Média', emptyTitle: 'Aucun média',
  list: crudList('media_items', { orderBy: 'published_at' }), create: crudCreate('media_items'), update: crudUpdate('media_items'), remove: crudRemove('media_items'),
  thumb: (m) => m.cover_url ? `<span class="mlogo"><img src="${esc(m.cover_url)}" alt="" loading="lazy"></span>` : '',
  itemTitle: (m) => m.title, itemSub: (m) => [labelOf(AD_MEDIA_KINDS, m.kind), m.published_at ? fmtDate(m.published_at) : ''].filter(Boolean).join(' · '),
  fields: [
    { k: 'kind', label: 'Type', type: 'select', default: 'interview', options: AD_MEDIA_KINDS },
    { k: 'title', label: 'Titre', type: 'text', required: true },
    { k: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { k: 'url', label: 'Lien (vidéo/audio)', type: 'text', required: true, placeholder: 'https://…' },
    { k: 'cover_url', label: 'Vignette', type: 'image', folder: 'media' },
    { k: 'duration_min', label: 'Durée (min)', type: 'number' },
    { k: 'published_at', label: 'Date de publication', type: 'datetime', omitEmpty: true },
  ],
};
const CRUD_POLLS = {
  title: 'Sondages', singular: 'Sondage', emptyTitle: 'Aucun sondage',
  list: crudList('polls'), create: crudCreate('polls'), update: crudUpdate('polls'), remove: crudRemove('polls'),
  itemTitle: (p) => p.question, itemSub: (p) => [(p.options || []).length + ' options', p.is_active ? 'actif' : 'inactif'].join(' · '),
  fields: [
    { k: 'question', label: 'Question', type: 'text', required: true },
    { k: 'options', label: 'Options de réponse', type: 'lines', required: true, rows: 5, placeholder: 'Une réponse par ligne' },
    { k: 'is_active', label: 'Actif', type: 'checkbox', default: true },
  ],
};
const CRUD_AWARDS = {
  title: 'Palmarès', singular: 'Distinction', emptyIcon: 'trophy', emptyTitle: 'Aucune distinction',
  list: crudList('awards', { orderBy: 'awarded_at' }), create: crudCreate('awards'), update: crudUpdate('awards'), remove: crudRemove('awards'),
  itemTitle: (a) => a.label || labelOf(AWARD_KINDS, a.kind), itemSub: (a) => [labelOf(AWARD_KINDS, a.kind), a.awarded_at].filter(Boolean).join(' · '),
  formContext: async () => ({ teams: await safe(listTeams(), []), players: await safe(listAdminPlayers(), []), seasons: await safe(listSeasons(), []) }),
  fields: (ctx) => [
    { k: 'kind', label: 'Type de distinction', type: 'select', required: true, options: AWARD_KINDS },
    { k: 'label', label: 'Intitulé (optionnel)', type: 'text', placeholder: 'Ex. Champion National 2026' },
    { k: 'season_id', label: 'Saison', type: 'select', emptyLabel: '— Aucune —', options: optsFrom(ctx.seasons, 'id', 'name') },
    { k: 'team_id', label: 'Équipe (optionnel)', type: 'select', emptyLabel: '— Aucune —', options: optsFrom(ctx.teams, 'id', 'name') },
    { k: 'player_id', label: 'Joueur (optionnel)', type: 'select', emptyLabel: '— Aucun —', options: ctx.players.map((p) => ({ value: p.id, label: p.full_name })) },
    { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
    { k: 'awarded_at', label: 'Date', type: 'date' },
  ],
};
const CRUD_SANCTIONS = {
  title: 'Discipline', singular: 'Sanction', emptyTitle: 'Aucune sanction',
  list: crudList('sanctions', { orderBy: 'decided_at' }), create: crudCreate('sanctions'), update: crudUpdate('sanctions'), remove: crudRemove('sanctions'),
  itemTitle: (s) => labelOf(SANCTION_KINDS, s.kind), itemSub: (s) => [s.reason, labelOf(SANCTION_STATUS, s.status), s.decided_at].filter(Boolean).join(' · '),
  formContext: async () => ({ teams: await safe(listTeams(), []), players: await safe(listAdminPlayers(), []) }),
  fields: (ctx) => [
    { k: 'kind', label: 'Type', type: 'select', default: 'avertissement', options: SANCTION_KINDS },
    { k: 'player_id', label: 'Joueur (optionnel)', type: 'select', emptyLabel: '— Aucun —', options: ctx.players.map((p) => ({ value: p.id, label: p.full_name })) },
    { k: 'team_id', label: 'Équipe (optionnel)', type: 'select', emptyLabel: '— Aucune —', options: optsFrom(ctx.teams, 'id', 'name') },
    { k: 'games', label: 'Matchs de suspension', type: 'number', omitEmpty: true, placeholder: '0' },
    { k: 'amount_gnf', label: 'Amende (GNF)', type: 'number', omitEmpty: true, placeholder: '0' },
    { k: 'reason', label: 'Motif', type: 'textarea', rows: 3 },
    { k: 'decided_at', label: 'Date de décision', type: 'date', omitEmpty: true },
    { k: 'status', label: 'Statut', type: 'select', default: 'active', options: SANCTION_STATUS },
  ],
};
const CRUD_LICENSES = {
  title: 'Licences', singular: 'Licence', emptyTitle: 'Aucune licence',
  list: crudList('licenses'), create: crudCreate('licenses'), update: crudUpdate('licenses'), remove: crudRemove('licenses'),
  itemTitle: (l) => l.number || 'Licence', itemSub: (l) => [labelOf(LICENSE_STATUS, l.status), l.expires_at].filter(Boolean).join(' · '),
  formContext: async () => ({ teams: await safe(listTeams(), []), players: await safe(listAdminPlayers(), []), seasons: await safe(listSeasons(), []) }),
  fields: (ctx) => [
    { k: 'player_id', label: 'Joueur', type: 'select', required: true, options: ctx.players.map((p) => ({ value: p.id, label: p.full_name })) },
    { k: 'team_id', label: 'Club', type: 'select', emptyLabel: '— Aucun —', options: optsFrom(ctx.teams, 'id', 'name') },
    { k: 'season_id', label: 'Saison', type: 'select', emptyLabel: '— Aucune —', options: optsFrom(ctx.seasons, 'id', 'name') },
    { k: 'number', label: 'N° de licence', type: 'text' },
    { k: 'status', label: 'Statut', type: 'select', default: 'pending', options: LICENSE_STATUS },
    { k: 'issued_at', label: 'Délivrée le', type: 'date' },
    { k: 'expires_at', label: 'Expire le', type: 'date' },
    { k: 'document_url', label: 'Document', type: 'image', folder: 'licenses' },
    { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
  ],
};
const CRUD_TRANSFERS = {
  title: 'Transferts', singular: 'Transfert', emptyTitle: 'Aucun transfert',
  list: crudList('transfers', { select: '*, player:players(full_name)', orderBy: 'requested_at' }), create: crudCreate('transfers'), update: crudUpdate('transfers'), remove: crudRemove('transfers'),
  itemTitle: (t) => (t.player && t.player.full_name) || 'Transfert', itemSub: (t) => [labelOf(TRANSFER_STATUS, t.status)].filter(Boolean).join(' · '),
  formContext: async () => ({ teams: await safe(listTeams(), []), players: await safe(listAdminPlayers(), []), seasons: await safe(listSeasons(), []) }),
  fields: (ctx) => [
    { k: 'player_id', label: 'Joueur', type: 'select', required: true, options: ctx.players.map((p) => ({ value: p.id, label: p.full_name })) },
    { k: 'from_team_id', label: 'Club d’origine', type: 'select', emptyLabel: '— Aucun —', options: optsFrom(ctx.teams, 'id', 'name') },
    { k: 'to_team_id', label: 'Nouveau club', type: 'select', emptyLabel: '— Aucun —', options: optsFrom(ctx.teams, 'id', 'name') },
    { k: 'season_id', label: 'Saison', type: 'select', emptyLabel: '— Aucune —', options: optsFrom(ctx.seasons, 'id', 'name') },
    { k: 'status', label: 'Statut', type: 'select', default: 'pending', options: TRANSFER_STATUS },
    { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
  ],
};
const CRUD_QUIZZES = {
  title: 'Quiz', singular: 'Quiz', emptyTitle: 'Aucun quiz',
  list: crudList('quizzes'), create: crudCreate('quizzes'), update: crudUpdate('quizzes'), remove: crudRemove('quizzes'),
  itemTitle: (q) => q.title, itemSub: (q) => (q.is_active ? 'actif' : 'inactif'),
  extraAction: { label: 'Questions', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.5a2.8 2.8 0 015.4 1c0 1.8-2.6 2-2.6 3.5M12 17.5v.4"/></svg>', run: (q) => openQuizQuestions(q.id, q.title) },
  fields: [
    { k: 'title', label: 'Titre', type: 'text', required: true },
    { k: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { k: 'is_active', label: 'Actif', type: 'checkbox' },
  ],
};

function adminFieldHtml(f, value) {
  const val = value == null ? (f.default != null ? f.default : '') : value;
  const nm = `name="${f.k}"`;
  if (f.type === 'checkbox') {
    return `<div class="field field-check"><label class="check"><input type="checkbox" ${nm} ${val ? 'checked' : ''}/><span>${esc(f.label)}</span></label></div>`;
  }
  if (f.type === 'select') {
    let opts = (f.options || []).slice();
    if (val !== '' && !opts.some((o) => String(o.value != null ? o.value : o) === String(val))) opts = [{ value: val, label: String(val) }].concat(opts);
    const optionsHtml = opts.map((o) => {
      const ov = o.value != null ? o.value : o, ol = o.label != null ? o.label : o;
      return `<option value="${esc(ov)}" ${String(val) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`;
    }).join('');
    const emptyOpt = f.required ? '' : `<option value="" ${val === '' ? 'selected' : ''}>${esc(f.emptyLabel || '— Aucun —')}</option>`;
    return `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><select ${nm} ${f.required ? 'required' : ''}>${emptyOpt}${optionsHtml}</select></div>`;
  }
  if (f.type === 'color') {
    const c = val || f.default || '#1C3F8F';
    return `<div class="field"><label>${esc(f.label)}</label><div class="color-field"><input type="color" ${nm} value="${esc(c)}"/><input type="text" class="color-hex" value="${esc(c)}" spellcheck="false" aria-label="Code couleur hexadécimal"/></div></div>`;
  }
  if (f.type === 'image') {
    return `<div class="field"><label>${esc(f.label)}</label>
      <div class="image-field" data-folder="${esc(f.folder || 'misc')}">
        <span class="image-prev${val ? ' has' : ''}">${val ? `<img src="${esc(val)}" alt=""/>` : ''}</span>
        <input type="hidden" ${nm} value="${esc(val || '')}"/>
        <label class="btn btn-ghost image-pick">Choisir une image<input type="file" accept="image/*" hidden/></label>
        <button type="button" class="image-clear"${val ? '' : ' hidden'}>Retirer</button>
        <span class="image-status" aria-live="polite"></span>
      </div></div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><textarea ${nm} rows="${f.rows || 4}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea></div>`;
  }
  if (f.type === 'datetime') {
    const dv = val ? String(val).slice(0, 16) : '';
    return `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><input type="datetime-local" ${nm} value="${esc(dv)}" ${f.required ? 'required' : ''} /></div>`;
  }
  if (f.type === 'lines') {
    const txt = Array.isArray(val) ? val.join('\n') : (val || '');
    return `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><textarea ${nm} rows="${f.rows || 4}" placeholder="${esc(f.placeholder || 'Une entrée par ligne')}">${esc(txt)}</textarea><span class="field-hint">Une entrée par ligne.</span></div>`;
  }
  const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
  const extra = f.type === 'number' ? ' min="0" inputmode="numeric"' : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  return `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><input type="${inputType}" ${nm} value="${esc(val)}"${extra}${ph} ${f.required ? 'required' : ''} autocomplete="off"/></div>`;
}

async function renderAdminCrud(cfg) {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `
    <div class="admin-head">
      <div><h1 class="view-title">${esc(cfg.title)}</h1><p class="view-sub">${esc(cfg.sub)}</p></div>
      <button class="btn" id="crudAdd">+ Ajouter</button>
    </div>
    <div id="crudBody">${loadingHtml()}</div>`;
  $('#crudAdd').addEventListener('click', () => openCrudForm(cfg, null));
  const items = await safe(cfg.list(), null);
  const body = $('#crudBody');
  if (!body) return;
  if (items === null) { body.innerHTML = errorHtml(); return; }
  if (!items.length) { body.innerHTML = emptyHtml(cfg.emptyTitle || 'Rien à afficher', cfg.emptySub || '', cfg.emptyIcon || 'inbox'); return; }
  body.innerHTML = `<div class="admin-list">${items.map((it) => crudRowHtml(cfg, it)).join('')}</div>`;
  if (cfg.extraAction) body.querySelectorAll('[data-extra]').forEach((b) => b.addEventListener('click', () => cfg.extraAction.run(items.find((x) => x.id === b.dataset.extra))));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openCrudForm(cfg, items.find((x) => x.id === b.dataset.edit))));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => confirmCrudDelete(cfg, items.find((x) => x.id === b.dataset.del))));
}
function crudRowHtml(cfg, it) {
  const thumb = cfg.thumb ? cfg.thumb(it) : '';
  const sub = cfg.itemSub ? cfg.itemSub(it) : '';
  return `<div class="admin-list-row">
    ${thumb}
    <div class="alr-main"><b>${esc(cfg.itemTitle(it))}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    <div class="alr-actions">
      ${cfg.extraAction ? `<button class="mini-btn" data-extra="${it.id}" aria-label="${esc(cfg.extraAction.label)}" title="${esc(cfg.extraAction.label)}">${cfg.extraAction.icon || ''}</button>` : ''}
      <button class="mini-btn" data-edit="${it.id}" aria-label="Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
      <button class="mini-del" data-del="${it.id}" aria-label="Supprimer">✕</button>
    </div></div>`;
}
async function confirmCrudDelete(cfg, it) {
  if (!it) return;
  if (!window.confirm(`Supprimer « ${cfg.itemTitle(it)} » ?\nCette action est définitive.`)) return;
  try { await cfg.remove(it.id); toast('Suppression effectuée'); renderAdminCrud(cfg); }
  catch (e) { toast(errMsg(e)); }
}
async function openCrudForm(cfg, item) {
  if (!isAdmin()) return renderAdminDenied();
  const editing = !!item;
  const ctx = cfg.formContext ? await safe(cfg.formContext(), {}) : {};
  const fields = typeof cfg.fields === 'function' ? cfg.fields(ctx) : cfg.fields;
  view.innerHTML = `
    <a class="back-btn" id="crudBack" role="button" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>${esc(cfg.title)}</a>
    <h1 class="view-title">${editing ? 'Modifier' : 'Nouveau'} · ${esc(cfg.singular.toLowerCase())}</h1>
    <form class="admin-form" id="crudForm" novalidate>
      ${fields.map((f) => adminFieldHtml(f, editing ? item[f.k] : undefined)).join('')}
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="crudCancel">Annuler</button>
        <button type="submit" class="btn" id="crudSave">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`;
  const back = () => renderAdminCrud(cfg);
  $('#crudBack').addEventListener('click', back);
  $('#crudBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); back(); } });
  $('#crudCancel').addEventListener('click', back);
  wireCrudForm(cfg, fields, item);
}
function collectCrudForm(fields, form) {
  const patch = {};
  for (const f of fields) {
    const node = form.querySelector(`[name="${f.k}"]`);
    if (!node) continue;
    if (f.type === 'checkbox') { patch[f.k] = node.checked; continue; }
    const raw = (node.value || '').trim();
    let value;
    if (f.type === 'number') value = raw === '' ? null : Number(raw);
    else if (f.type === 'datetime') value = raw === '' ? null : raw + ':00.000Z';
    else if (f.type === 'lines') value = raw === '' ? [] : raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    else value = raw === '' ? null : raw;
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (f.omitEmpty && empty) continue; // laisser la valeur par défaut de la base (colonnes NOT NULL)
    patch[f.k] = value;
  }
  return patch;
}
function wireImageField(wrap) {
  const fileInput = wrap.querySelector('input[type=file]');
  const hidden = wrap.querySelector('input[type=hidden]');
  const prev = wrap.querySelector('.image-prev');
  const status = wrap.querySelector('.image-status');
  const clearBtn = wrap.querySelector('.image-clear');
  const folder = wrap.dataset.folder || 'misc';
  const sync = () => { if (clearBtn) clearBtn.hidden = !hidden.value; };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image trop lourde (5 Mo maximum)'); fileInput.value = ''; return; }
    status.textContent = 'Envoi…';
    try {
      const url = await uploadImage(file, folder);
      hidden.value = url;
      prev.innerHTML = `<img src="${esc(url)}" alt=""/>`;
      prev.classList.add('has');
      status.textContent = 'Image ajoutée ✓';
    } catch (e) { status.textContent = ''; toast(errMsg(e)); }
    fileInput.value = '';
    sync();
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    hidden.value = ''; prev.innerHTML = ''; prev.classList.remove('has'); status.textContent = ''; sync();
  });
  sync();
}
function wireCrudForm(cfg, fields, item) {
  const form = $('#crudForm');
  form.querySelectorAll('.color-field').forEach((cf) => {
    const color = cf.querySelector('input[type=color]');
    const hex = cf.querySelector('.color-hex');
    color.addEventListener('input', () => { hex.value = color.value; });
    hex.addEventListener('change', () => { const v = hex.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) color.value = v; else hex.value = color.value; });
  });
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = collectCrudForm(fields, form);
    for (const f of fields) {
      const v = patch[f.k];
      if (f.required && (v == null || v === '' || (Array.isArray(v) && v.length === 0))) { toast(`« ${f.label} » est obligatoire`); return; }
    }
    const btn = $('#crudSave'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
      if (item) await cfg.update(item.id, patch); else await cfg.create(patch);
      toast(item ? 'Modifications enregistrées' : 'Création effectuée');
      renderAdminCrud(cfg);
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
}

async function listAccounts() {
  const { data, error } = await sb.rpc('admin_list_accounts');
  if (error) throw error;
  return data ?? [];
}
async function setUserRole(id, role) {
  const { error } = await sb.rpc('admin_set_role', { target: id, new_role: role });
  if (error) throw error;
}
const ROLE_OPTIONS = [['fan', 'Supporter'], ['joueur', 'Joueur'], ['club', 'Club'], ['table_technique', 'Table technique'], ['admin', 'Fédération (admin)']];
function roleFrLabel(r) { return (ROLE_OPTIONS.find((o) => o[0] === r) || [null, r])[1]; }
async function renderAdminRoles() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Comptes &amp; rôles</h1><p class="view-sub">Attribuez un rôle aux comptes existants. Chaque personne crée d’abord son compte (inscription), puis apparaît ici. Après un changement, elle doit se reconnecter pour que le rôle s’applique.</p><div id="arBody">${loadingHtml()}</div>`;
  const accounts = await safe(listAccounts(), null);
  const body = $('#arBody');
  if (!body) return;
  if (accounts === null) { body.innerHTML = errorHtml(); return; }
  if (!accounts.length) { body.innerHTML = emptyHtml('Aucun compte', 'Les comptes apparaîtront ici après inscription.', 'inbox'); return; }
  const myId = session?.user?.id;
  body.innerHTML = `<div class="search-box" style="margin-bottom:14px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input type="search" id="arSearch" placeholder="Rechercher un nom ou un e-mail…" autocomplete="off" /></div>
  <div class="roster">${accounts.map((a) => {
    const isMe = a.id === myId;
    const opts = ROLE_OPTIONS.map(([v, l]) => `<option value="${v}" ${a.role === v ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="roster-row" data-search="${esc(((a.full_name || '') + ' ' + (a.email || '')).toLowerCase())}"><span class="rr-name">${esc(a.full_name || '—')}<br><span class="rr-sub">${esc(a.email || '')}${isMe ? ' · vous' : ''}</span></span><select class="poule-select role-select" data-id="${a.id}" ${isMe ? 'disabled title="Vous ne pouvez pas changer votre propre rôle"' : ''}>${opts}</select></div>`;
  }).join('')}</div>`;
  body.querySelectorAll('.role-select').forEach((sel) => {
    sel.dataset.prev = sel.value;
    sel.addEventListener('change', async () => {
      const id = sel.dataset.id, role = sel.value;
      sel.disabled = true;
      try { await setUserRole(id, role); toast('Rôle mis à jour : ' + roleFrLabel(role)); sel.dataset.prev = role; }
      catch (e) { toast(errMsg(e)); sel.value = sel.dataset.prev; }
      sel.disabled = false;
    });
  });
  const search = $('#arSearch');
  const rows = body.querySelectorAll('.roster-row');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    rows.forEach((row) => { row.style.display = !q || (row.dataset.search || '').includes(q) ? '' : 'none'; });
  });
}

async function listQuizQuestions(quizId) {
  const { data, error } = await sb.from('quiz_questions').select('*').eq('quiz_id', quizId).order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function createQuizQuestion(q) { const { error } = await sb.from('quiz_questions').insert(q); if (error) throw error; }
async function deleteQuizQuestion(id) { const { error } = await sb.from('quiz_questions').delete().eq('id', id); if (error) throw error; }
async function openQuizQuestions(quizId, quizTitle) {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = `<a class="back-btn" id="qqBack" role="button" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Quiz</a><h1 class="view-title">Questions</h1><p class="view-sub">${esc(quizTitle || '')}</p><div id="qqBody">${loadingHtml()}</div>`;
  $('#qqBack').addEventListener('click', () => renderAdminCrud(CRUD_QUIZZES));
  const questions = await safe(listQuizQuestions(quizId), []);
  const list = questions.length
    ? `<div class="roster">${questions.map((q, i) => `<div class="roster-row"><span class="rr-name"><b>${i + 1}.</b> ${esc(q.question)}<br><span class="rr-sub">${(q.options || []).map((o, idx) => `${idx === q.correct_index ? '✓ ' : ''}${esc(o)}`).join(' · ')}</span></span><button class="mini-del" data-del="${q.id}" aria-label="Supprimer">✕</button></div>`).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucune question pour l’instant.</p>';
  $('#qqBody').innerHTML = `
    <form class="admin-form" id="qqForm" novalidate>
      <div class="field"><label>Question *</label><input name="question" required autocomplete="off" /></div>
      <div class="field"><label>Réponses *</label><textarea name="options" rows="4" placeholder="Une réponse par ligne"></textarea><span class="field-hint">Une réponse par ligne (2 minimum).</span></div>
      <div class="field"><label>N° de la bonne réponse</label><input type="number" name="correct" min="1" value="1" /></div>
      <button class="btn" type="submit">Ajouter la question</button>
    </form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Questions</h2></div>${list}</div>`;
  const form = $('#qqForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const question = (fd.get('question') || '').trim();
    const options = (fd.get('options') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!question) return toast('Question obligatoire');
    if (options.length < 2) return toast('Ajoutez au moins 2 réponses');
    const correct = Math.max(1, Math.min(options.length, parseInt(fd.get('correct'), 10) || 1)) - 1;
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      await createQuizQuestion({ quiz_id: quizId, question, options, correct_index: correct, position: questions.length });
      toast('Question ajoutée');
      openQuizQuestions(quizId, quizTitle);
    } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#qqBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await deleteQuizQuestion(b.dataset.del); toast('Question supprimée'); openQuizQuestions(quizId, quizTitle); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

async function listModerationWords() { const { data, error } = await sb.from('moderation_words').select('word').order('word', { ascending: true }); if (error) throw error; return data ?? []; }
async function addModerationWord(word) { const { error } = await sb.from('moderation_words').insert({ word }); if (error) throw error; }
async function removeModerationWord(word) { const { error } = await sb.from('moderation_words').delete().eq('word', word); if (error) throw error; }
async function renderAdminModeration() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Modération</h1><p class="view-sub">Mots interdits dans les commentaires et le chat en direct.</p><div id="modBody">${loadingHtml()}</div>`;
  const words = await safe(listModerationWords(), []);
  const list = words.length
    ? `<div class="roster">${words.map((w) => `<div class="roster-row"><span class="rr-name">${esc(w.word)}</span><button class="mini-del" data-del="${esc(w.word)}" aria-label="Supprimer">✕</button></div>`).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucun mot filtré.</p>';
  $('#modBody').innerHTML = `
    <form class="social-form" id="modForm"><div class="field"><label>Ajouter un mot interdit</label><input name="word" required autocomplete="off" /></div><button class="btn" type="submit">Ajouter</button></form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Mots filtrés</h2></div>${list}</div>`;
  const form = $('#modForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const word = (new FormData(form).get('word') || '').trim().toLowerCase();
    if (!word) return;
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await addModerationWord(word); toast('Mot ajouté'); renderAdminModeration(); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#modBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeModerationWord(b.dataset.del); toast('Mot supprimé'); renderAdminModeration(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

// --- Officiels d'un match (arbitres, délégués, table de marque) ---
const OFFICIAL_ROLES = [{ value: 'principal', label: 'Arbitre principal' }, { value: 'assistant', label: 'Arbitre assistant' }, { value: 'table', label: 'Table de marque' }, { value: 'commissaire', label: 'Commissaire / Délégué' }];
async function listRefereesLite() { const { data, error } = await sb.from('referees').select('id, full_name').order('full_name'); if (error) throw error; return data ?? []; }
async function getMatchOfficials(matchId) { const { data, error } = await sb.from('match_officials').select('*, referee:referees(full_name)').eq('match_id', matchId); if (error) throw error; return data ?? []; }
async function addMatchOfficial(row) { const { error } = await sb.from('match_officials').upsert(row, { onConflict: 'match_id,referee_id' }); if (error) throw error; }
async function removeMatchOfficial(matchId, refereeId) { const { error } = await sb.from('match_officials').delete().eq('match_id', matchId).eq('referee_id', refereeId); if (error) throw error; }
async function openMatchOfficials(matchId, opts = {}) {
  if (!isAdmin()) return renderAdminDenied();
  const backFn = opts.back || renderAdminMatches;
  const backLabel = opts.backLabel || 'Matchs';
  view.innerHTML = adminBackHtml() + loadingHtml();
  const [m, referees, officials] = await Promise.all([safe(getMatch(matchId), null), safe(listRefereesLite(), []), safe(getMatchOfficials(matchId), [])]);
  if (!m) { view.innerHTML = adminBackHtml() + errorHtml(); return; }
  const refOpts = '<option value="">— Choisir —</option>' + referees.map((r) => `<option value="${r.id}">${esc(r.full_name)}</option>`).join('');
  const roleOpts = OFFICIAL_ROLES.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
  const list = officials.length
    ? `<div class="roster">${officials.map((o) => `<div class="roster-row"><span class="rr-name">${esc(o.referee?.full_name || '?')}<br><span class="rr-sub">${esc(labelOf(OFFICIAL_ROLES, o.role))}</span></span><button class="mini-del" data-del="${o.referee_id}" aria-label="Retirer">✕</button></div>`).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucun officiel désigné.</p>';
  view.innerHTML = `
    <a class="back-btn" id="moBack" role="button" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>${esc(backLabel)}</a>
    <h1 class="view-title">Officiels du match</h1>
    <p class="view-sub">${esc(m.home_team?.name || '?')} — ${esc(m.away_team?.name || '?')}. Arbitres, délégués et table de marque.${referees.length ? '' : ' Ajoutez d’abord des arbitres dans « Arbitres ».'}</p>
    <form class="social-form" id="moForm">
      <div class="field"><label>Officiel</label><select name="referee_id" required>${refOpts}</select></div>
      <div class="field"><label>Rôle</label><select name="role">${roleOpts}</select></div>
      <button class="btn" type="submit">Désigner</button>
    </form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Désignés</h2></div>${list}</div>`;
  const back = backFn;
  $('#moBack').addEventListener('click', back);
  $('#moBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); back(); } });
  const form = $('#moForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form); const ref = fd.get('referee_id');
    if (!ref) return toast('Choisissez un officiel');
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await addMatchOfficial({ match_id: matchId, referee_id: ref, role: fd.get('role') }); toast('Officiel désigné'); openMatchOfficials(matchId, opts); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeMatchOfficial(matchId, b.dataset.del); toast('Officiel retiré'); openMatchOfficials(matchId, opts); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

// --- Responsables de club (club_members) ---
let acmTeam = '';
async function listClubMembers() { const { data, error } = await sb.from('club_members').select('*').order('created_at'); if (error) throw error; return data ?? []; }
async function addClubMember(userId, teamId) { const { error } = await sb.from('club_members').insert({ user_id: userId, team_id: teamId }); if (error) throw error; }
async function removeClubMember(userId, teamId) { const { error } = await sb.from('club_members').delete().eq('user_id', userId).eq('team_id', teamId); if (error) throw error; }
async function renderAdminClubMembers() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Responsables de club</h1><p class="view-sub">Désignez les personnes qui gèrent un club (elles pourront l’administrer dans l’app). Chacune crée d’abord son compte.</p><div id="cmFilter"></div><div id="cmBody">${loadingHtml()}</div>`;
  const [teams, accounts, members] = await Promise.all([safe(listTeams(), []), safe(listAccounts(), []), safe(listClubMembers(), [])]);
  if (!teams.length) { $('#cmBody').innerHTML = emptyHtml('Aucun club', 'Créez d’abord des clubs dans « Clubs ».', 'ball'); return; }
  if (!acmTeam || !teams.find((t) => t.id === acmTeam)) acmTeam = teams[0].id;
  const f = $('#cmFilter'); f.className = 'segmented';
  f.innerHTML = teams.map((t) => `<button class="seg ${acmTeam === t.id ? 'active' : ''}" data-c="${t.id}">${esc(t.name)}</button>`).join('');
  f.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { acmTeam = b.dataset.c; renderAdminClubMembers(); }));
  const accById = {}; accounts.forEach((a) => { accById[a.id] = a; });
  const teamMembers = members.filter((m) => m.team_id === acmTeam);
  const memberIds = new Set(teamMembers.map((m) => m.user_id));
  const available = accounts.filter((a) => !memberIds.has(a.id));
  const list = teamMembers.length
    ? `<div class="roster">${teamMembers.map((m) => { const a = accById[m.user_id]; return `<div class="roster-row"><span class="rr-name">${esc(a?.full_name || '—')}<br><span class="rr-sub">${esc(a?.email || m.user_id)}</span></span><button class="mini-del" data-del="${m.user_id}" aria-label="Retirer">✕</button></div>`; }).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucun responsable pour ce club.</p>';
  $('#cmBody').innerHTML = `
    <form class="social-form" id="cmForm"><div class="field"><label>Ajouter un responsable</label><select name="user_id" required><option value="">— Choisir un compte —</option>${available.map((a) => `<option value="${a.id}">${esc(a.full_name || a.email)} (${esc(a.email)})</option>`).join('')}</select></div><button class="btn" type="submit">Ajouter</button></form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Responsables du club</h2></div>${list}</div>`;
  const form = $('#cmForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const uid = new FormData(form).get('user_id'); if (!uid) return;
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await addClubMember(uid, acmTeam); toast('Responsable ajouté'); renderAdminClubMembers(); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#cmBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeClubMember(b.dataset.del, acmTeam); toast('Responsable retiré'); renderAdminClubMembers(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

// --- Messages aux clubs (club_messages) ---
async function listClubMessages() { const { data, error } = await sb.from('club_messages').select('*, recipients:club_message_recipients(team_id)').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; }
async function sendClubMessage({ title, body, teamIds }) {
  const { data, error } = await sb.from('club_messages').insert({ title, body, created_by: session?.user?.id || null }).select('id').single();
  if (error) throw error;
  const rows = teamIds.map((t) => ({ message_id: data.id, team_id: t }));
  const { error: e2 } = await sb.from('club_message_recipients').insert(rows);
  if (e2) throw e2;
}
async function deleteClubMessage(id) { const { error } = await sb.from('club_messages').delete().eq('id', id); if (error) throw error; }
async function renderAdminClubMessages() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Messages aux clubs</h1><p class="view-sub">Envoyez un message que les clubs verront dans leur espace.</p><div id="msgBody">${loadingHtml()}</div>`;
  const [teams, messages] = await Promise.all([safe(listTeams(), []), safe(listClubMessages(), [])]);
  const teamOpts = teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const list = messages.length
    ? `<div class="roster">${messages.map((m) => `<div class="roster-row"><span class="rr-name">${esc(m.title)}<br><span class="rr-sub">${(m.recipients || []).length} club(s) · ${fmtDate(m.created_at)}</span></span><button class="mini-del" data-del="${m.id}" aria-label="Supprimer">✕</button></div>`).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucun message envoyé.</p>';
  $('#msgBody').innerHTML = `
    <form class="admin-form" id="msgForm" novalidate>
      <div class="field"><label>Titre *</label><input name="title" required autocomplete="off" /></div>
      <div class="field"><label>Message *</label><textarea name="body" rows="5" required></textarea></div>
      <div class="field"><label>Destinataires</label><select name="target" id="msgTarget"><option value="all">Tous les clubs</option><option value="one">Un club précis</option></select></div>
      <div class="field" id="msgOneWrap" style="display:none"><label>Club</label><select name="team_id">${teamOpts}</select></div>
      <button class="btn" type="submit">Envoyer</button>
    </form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Messages envoyés</h2></div>${list}</div>`;
  const targetSel = $('#msgTarget');
  targetSel.addEventListener('change', () => { $('#msgOneWrap').style.display = targetSel.value === 'one' ? '' : 'none'; });
  const form = $('#msgForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = (fd.get('title') || '').trim(), body = (fd.get('body') || '').trim();
    if (!title || !body) return toast('Titre et message obligatoires');
    if (!teams.length) return toast('Aucun club à qui envoyer');
    const teamIds = fd.get('target') === 'one' ? [fd.get('team_id')].filter(Boolean) : teams.map((t) => t.id);
    if (!teamIds.length) return toast('Choisissez un destinataire');
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await sendClubMessage({ title, body, teamIds }); toast('Message envoyé aux clubs'); renderAdminClubMessages(); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#msgBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!window.confirm('Supprimer ce message ?')) return;
    b.disabled = true;
    try { await deleteClubMessage(b.dataset.del); toast('Message supprimé'); renderAdminClubMessages(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

// --- Bannissements (bans) ---
async function listBans() { const { data, error } = await sb.from('bans').select('*').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; }
async function addBan(row) { const { error } = await sb.from('bans').upsert(row, { onConflict: 'user_id' }); if (error) throw error; }
async function removeBan(userId) { const { error } = await sb.from('bans').delete().eq('user_id', userId); if (error) throw error; }
async function renderAdminBans() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Bannissements</h1><p class="view-sub">Empêcher un compte de commenter et d’utiliser le chat en direct.</p><div id="banBody">${loadingHtml()}</div>`;
  const [accounts, bans] = await Promise.all([safe(listAccounts(), []), safe(listBans(), [])]);
  const accById = {}; accounts.forEach((a) => { accById[a.id] = a; });
  const bannedIds = new Set(bans.map((b) => b.user_id));
  const available = accounts.filter((a) => !bannedIds.has(a.id));
  const list = bans.length
    ? `<div class="roster">${bans.map((b) => { const a = accById[b.user_id]; return `<div class="roster-row"><span class="rr-name">${esc(a?.full_name || a?.email || b.user_id)}<br><span class="rr-sub">${b.reason ? esc(b.reason) + ' · ' : ''}${b.until ? 'jusqu’au ' + fmtDate(b.until) : 'permanent'}</span></span><button class="mini-del" data-del="${b.user_id}" aria-label="Lever le bannissement">✕</button></div>`; }).join('')}</div>`
    : '<p class="view-sub" style="padding:6px 2px">Aucun compte banni.</p>';
  $('#banBody').innerHTML = `
    <form class="admin-form" id="banForm" novalidate>
      <div class="field"><label>Compte</label><select name="user_id" required><option value="">— Choisir —</option>${available.map((a) => `<option value="${a.id}">${esc(a.full_name || a.email)} (${esc(a.email)})</option>`).join('')}</select></div>
      <div class="field"><label>Motif</label><input name="reason" autocomplete="off" /></div>
      <div class="field"><label>Jusqu’au (vide = permanent)</label><input type="datetime-local" name="until" /></div>
      <button class="btn" type="submit">Bannir</button>
    </form>
    <div class="block" style="margin-top:20px"><div class="block-head"><h2>Comptes bannis</h2></div>${list}</div>`;
  const form = $('#banForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form); const uid = fd.get('user_id');
    if (!uid) return toast('Choisissez un compte');
    const until = fd.get('until');
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await addBan({ user_id: uid, reason: (fd.get('reason') || '').trim() || null, until: until ? until + ':00.000Z' : null }); toast('Compte banni'); renderAdminBans(); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
  $('#banBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeBan(b.dataset.del); toast('Bannissement levé'); renderAdminBans(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
}

const RENDERERS = {
  accueil: renderAccueil,
  admin: renderAdmin,
  'admin-teams': () => renderAdminCrud(CRUD_TEAMS),
  'admin-players': () => renderAdminCrud(CRUD_PLAYERS),
  'admin-competitions': () => renderAdminCrud(CRUD_COMPS),
  'admin-matches': renderAdminMatches,
  'admin-news': () => renderAdminCrud(CRUD_NEWS),
  'admin-media': () => renderAdminCrud(CRUD_MEDIA),
  'admin-events': () => renderAdminCrud(CRUD_EVENTS),
  'admin-sponsors': () => renderAdminCrud(CRUD_SPONSORS),
  'admin-awards': () => renderAdminCrud(CRUD_AWARDS),
  'admin-polls': () => renderAdminCrud(CRUD_POLLS),
  'admin-referees': () => renderAdminCrud(CRUD_REFEREES),
  'admin-sanctions': () => renderAdminCrud(CRUD_SANCTIONS),
  'admin-licenses': () => renderAdminCrud(CRUD_LICENSES),
  'admin-transfers': () => renderAdminCrud(CRUD_TRANSFERS),
  'admin-seasons': () => renderAdminCrud(CRUD_SEASONS),
  'admin-quizzes': () => renderAdminCrud(CRUD_QUIZZES),
  'admin-moderation': renderAdminModeration,
  'admin-club-members': renderAdminClubMembers,
  'admin-club-messages': renderAdminClubMessages,
  'admin-bans': renderAdminBans,
  'admin-poules': renderAdminPoules,
  'admin-socials': renderAdminSocials,
  'admin-playoffs': renderAdminPlayoffs,
  'admin-roles': renderAdminRoles,
  playoffs: renderPlayoffs,
  matchs: renderMatchs,
  classement: renderClassement,
  actus: renderActus,
  leaders: renderLeaders,
  plus: renderPlus,
  videos: renderVideos,
  clubs: renderClubs,
  fanzone: renderFanzone,
  recherche: renderSearch,
  favoris: renderFavoris,
  apropos: renderApropos,
  comparateur: renderCompare,
  palmares: renderPalmares,
  arbitres: renderArbitres,
  discipline: renderDiscipline,
  medias: renderMedias,
  agenda: renderAgenda,
  supporters: renderSupporters,
  quiz: renderQuiz,
  photos: renderPhotos,
  records: renderRecords,
  'stats-equipes': renderStatsEquipes,
  'stats-avancees': renderStatsAvancees,
  'mon-club': renderMonClub,
  'mon-club-publications': renderClubPublications,
  'mon-club-messages': renderClubMessages,
  'mon-club-licences': renderClubLicences,
  'mon-club-discipline': renderClubDiscipline,
  'mon-club-feuille': renderClubFeuille,
  'mon-club-sondages': renderClubPolls,
  'mon-club-sponsors': renderClubSponsors,
  'mon-club-galerie': renderClubGallery,
  'mon-club-evenements': renderClubEvents,
  'inscription-club': renderInscriptionClub,
  'admin-registrations': renderAdminRegistrations,
};

function scheduleLiveRefresh(hasLive) {
  clearTimeout(liveTimer);
  if (!hasLive) return;
  liveTimer = setTimeout(() => {
    if (RENDERERS[currentRoute]) RENDERERS[currentRoute]();
  }, 25000);
}

// --------------------------------------------------------------- routeur
const ROUTES = Object.keys(RENDERERS);
const PLUS_ROUTES = ['plus', 'videos', 'clubs', 'playoffs', 'fanzone', 'recherche', 'favoris', 'apropos', 'comparateur', 'palmares', 'arbitres', 'discipline', 'medias', 'agenda', 'supporters', 'quiz', 'photos', 'records', 'stats-equipes', 'stats-avancees'];
function setActiveTab(route) {
  const tabRoute = PLUS_ROUTES.includes(route) ? 'plus' : route;
  document.querySelectorAll('.app-tab').forEach((t) => t.classList.toggle('active', t.dataset.route === tabRoute));
}
function render(route) {
  clearTimeout(liveTimer);
  clearTimeout(detailTimer);
  currentRoute = route;
  lastListRoute = route; // pour le bouton « Retour » d'une fiche match
  viewRendered = true;
  setActiveTab(route);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  (RENDERERS[route] || renderAccueil)();
}
function handleHash() {
  teardownChat();
  const h = location.hash.replace('#', '');
  if (h === 'connexion' || h === 'inscription') {
    if (!viewRendered) render('accueil');
    openAuth(h === 'inscription' ? 'signup' : 'login');
    return;
  }
  const DETAILS = [
    ['match/', renderMatchDetail],
    ['player/', renderPlayer],
    ['team/', renderTeam],
    ['news/', renderNewsDetail],
    ['quiz/', renderQuizDetail],
    ['scouting/', renderScouting],
  ];
  for (const [prefix, fn] of DETAILS) {
    if (h.startsWith(prefix)) {
      viewRendered = true;
      currentRoute = h;
      clearTimeout(liveTimer);
      clearTimeout(detailTimer);
      setActiveTab('');
      fn(h.slice(prefix.length));
      return;
    }
  }
  render(ROUTES.includes(h) ? h : 'accueil');
}

// --------------------------------------------------------------- auth UI
const modal = $('#authModal');
let authMode = 'login';

function openAuth(mode = 'login') {
  authMode = mode;
  setAuthMode(mode);
  clearAuthMsg();
  modal.classList.add('open');
  setTimeout(() => $('#email').focus(), 50);
}
function closeAuth() {
  modal.classList.remove('open');
  if (location.hash.replace('#', '') === 'connexion' || location.hash.replace('#', '') === 'inscription') {
    history.replaceState(null, '', '#' + currentRoute);
  }
}
function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  $('#tabLogin').classList.toggle('active', !isSignup);
  $('#tabSignup').classList.toggle('active', isSignup);
  $('#nameField').style.display = isSignup ? '' : 'none';
  $('#authTitle').textContent = isSignup ? 'Créer un compte' : 'Bon retour';
  $('#authSubmit').textContent = isSignup ? 'Créer mon compte supporter' : 'Se connecter';
  $('#password').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  clearAuthMsg();
}
function clearAuthMsg() {
  $('#authError').classList.remove('show');
  $('#authOk').classList.remove('show');
}
function showAuthError(msg) {
  const e = $('#authError');
  e.textContent = msg;
  e.classList.add('show');
  $('#authOk').classList.remove('show');
}
function showAuthOk(msg) {
  const e = $('#authOk');
  e.textContent = msg;
  e.classList.add('show');
  $('#authError').classList.remove('show');
}
function translateErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (m.includes('email not confirmed')) return 'E-mail non confirmé. Vérifiez votre boîte de réception.';
  if (m.includes('password should be')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Adresse e-mail invalide.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques instants.';
  return msg || 'Une erreur est survenue. Réessayez.';
}

async function onAuthSubmit(e) {
  e.preventDefault();
  clearAuthMsg();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const fullName = $('#fullName').value.trim();
  const btn = $('#authSubmit');

  if (authMode === 'signup' && !fullName) return showAuthError('Indiquez votre nom ou un pseudo.');
  if (!email || !password) return showAuthError('Renseignez votre e-mail et votre mot de passe.');

  btn.setAttribute('disabled', 'true');
  const original = btn.textContent;
  btn.textContent = 'Veuillez patienter…';

  try {
    if (authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) { showAuthError(translateErr(error.message)); return; }
      if (!data.session) {
        showAuthOk('Compte créé ! Vérifiez votre e-mail pour confirmer votre inscription, puis connectez-vous.');
        setAuthMode('login');
        $('#authOk').classList.add('show');
        return;
      }
      toast('Compte créé. Bienvenue !');
      closeAuth();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { showAuthError(translateErr(error.message)); return; }
      toast('Connexion réussie.');
      closeAuth();
    }
    $('#authForm').reset();
  } finally {
    btn.removeAttribute('disabled');
    btn.textContent = original;
  }
}

async function loadProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  profile = data ?? null;
}

function roleLabel(role) {
  return { admin: 'Fédération', table_technique: 'Table technique', club: 'Club', joueur: 'Joueur', fan: 'Supporter' }[role] || 'Supporter';
}

function renderAuthArea() {
  const area = $('#authArea');
  if (session) {
    const name = profile?.full_name || session.user.email;
    area.innerHTML = `
      <div class="user-chip" id="userChip" tabindex="0" role="button" aria-haspopup="true">
        <span class="ava">${initials(profile?.full_name || session.user.email)}</span>
        <span class="who">${esc((profile?.full_name || session.user.email).split('@')[0])}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        <div class="user-menu" id="userMenu">
          <div class="mhead"><div class="n">${esc(name)}</div><div class="r">${roleLabel(profile?.role)}</div></div>
          ${isAdmin() ? `<a class="mi" href="#admin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>Espace fédération</a>` : ''}
          ${(myClubsCache && myClubsCache.length) ? `<a class="mi" href="#mon-club"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 2 4-2 4 3-3 3v10H7V9L4 6z"/></svg>Mon club</a>` : ''}
          <a class="mi" href="#inscription-club"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8"/><path d="M9 12l2.5 2.5L21 5"/></svg>Inscrire mon club</a>
          <a class="mi" href="index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>Site de la fédération</a>
          <a class="mi" href="confidentialite.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Confidentialité</a>
          <a class="mi" href="cookies.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="14.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="15" cy="9" r=".6" fill="currentColor"/></svg>Cookies</a>
          <a class="mi" href="cgu.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>CGU &amp; CGV</a>
          <a class="mi" href="mentions-legales.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V9l6-4 6 4v12M10 21v-6h4v6"/></svg>Mentions légales</a>
          <button class="mi danger" id="btnSignout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>Se déconnecter</button>
        </div>
      </div>`;
    const chip = $('#userChip'), menu = $('#userMenu');
    const toggle = (ev) => { ev.stopPropagation(); menu.classList.toggle('open'); };
    chip.addEventListener('click', toggle);
    chip.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') toggle(ev); });
    $('#btnSignout').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await sb.auth.signOut();
      toast('Déconnecté.');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
  } else {
    area.innerHTML = `
      <button class="btn ghost sm" id="btnLoginHeader">Se connecter</button>
      <button class="btn sm" id="btnSignupHeader">Créer un compte</button>`;
    $('#btnLoginHeader').addEventListener('click', () => openAuth('login'));
    $('#btnSignupHeader').addEventListener('click', () => openAuth('signup'));
  }
}

// =========================================================================
// ESPACE CLUB — un compte rattaché par la fédération (table club_members, RLS)
// gère l'effectif et la présentation de SON club. Les garde-fous vivent dans la
// base (policies RLS + fonctions security definer) : ce code ne fait que
// refléter ce que le serveur autorise déjà, un client modifié n'ouvre rien.
// =========================================================================
const TEAM_COLORS_WEB = ['#1C3F8F', '#9A2A2A', '#0F7A4D', '#B5891F', '#6A3FA0', '#1F7A8C'];
const POSITIONS_WEB = ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'];

function icoSvg(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
// petite icône devant un titre de section (.block-head h2) — repère visuel, purement additif.
function bhIco(path) {
  return `<span class="bh-ic">${icoSvg(path)}</span>`;
}
function fmtFullDate(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); }
  catch { return ''; }
}

// -- données : rattachement du compte
async function loadMyClubs() {
  if (!session) { myClubsCache = []; return myClubsCache; }
  const { data } = await sb.from('club_members').select('team:teams(*)');
  myClubsCache = (data ?? []).map((r) => r.team).filter(Boolean);
  return myClubsCache;
}
async function resolveMyClub() {
  if (myClubsCache === null) await safe(loadMyClubs(), []);
  return (myClubsCache || [])[0] || null;
}

// -- données : effectif & présentation (bornés au club par la base)
async function saveClubPlayer(teamId, input) {
  // `team_id` est toujours réaffirmé : c'est lui que la policy vérifie des deux
  // côtés. Changer de club est un transfert, décidé par la fédération.
  const payload = {
    full_name: (input.full_name || '').trim(), team_id: teamId,
    number: input.number, position: input.position, height_cm: input.height_cm,
    birth_date: input.birth_date, photo_url: input.photo_url,
  };
  const q = input.id ? sb.from('players').update(payload).eq('id', input.id) : sb.from('players').insert(payload);
  const { error } = await q;
  if (error) throw error;
}
async function updateMyClub(input) {
  // Passe par une fonction serveur qui n'accepte que les champs de présentation :
  // les policies RLS ne savent pas restreindre les colonnes.
  const { error } = await sb.rpc('update_my_club', {
    p_team_id: input.team_id, p_coach: input.coach, p_city: input.city,
    p_color: input.color, p_logo_url: input.logo_url,
    p_presentation: input.presentation ?? null, p_founded_year: input.founded_year ?? null,
  });
  if (error) throw error;
}

// -- données : tableau de bord (regroupement de données publiques)
async function getClubTopScorer(teamId) {
  const { data } = await sb.from('player_season_stats').select('*').eq('team_id', teamId).order('ppg', { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}
async function getClubDashboard(teamId) {
  const [matches, standings, topScorer] = await Promise.all([
    safe(getTeamMatches(teamId), []), safe(listStandings(), []), safe(getClubTopScorer(teamId), null),
  ]);
  const now = Date.now();
  const scheduled = matches.filter((m) => m.status === 'scheduled').sort((a, b) => tOf(a.scheduled_at) - tOf(b.scheduled_at));
  const nextMatch = scheduled.find((m) => tOf(m.scheduled_at) >= now) ?? scheduled[0] ?? null;
  const lastMatch = matches.filter((m) => m.status === 'finished').sort((a, b) => tOf(b.scheduled_at) - tOf(a.scheduled_at))[0] ?? null;
  const idx = standings.findIndex((s) => s.team_id === teamId);
  return { nextMatch, lastMatch, standing: idx >= 0 ? standings[idx] : null, rank: idx >= 0 ? idx + 1 : null, topScorer };
}

// -- données : licences (lecture seule ; la fédération délivre)
async function listClubLicenses(teamId) {
  const { data, error } = await sb.from('licenses').select('*, player:players(*), season:seasons(*)').eq('team_id', teamId);
  if (error) throw error;
  return data ?? [];
}

// -- données : publications & audience
async function listTeamPosts(teamId) {
  const { data, error } = await sb.from('club_posts').select('*').eq('team_id', teamId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function createClubPost(input) {
  const { error } = await sb.from('club_posts').insert({ team_id: input.team_id, author_id: input.author_id, body: (input.body || '').trim(), image_url: input.image_url });
  if (error) throw error;
}
async function deleteClubPost(id) {
  const { error } = await sb.from('club_posts').delete().eq('id', id);
  if (error) throw error;
}
async function getClubAudience(teamId) {
  // Le décompte d'abonnés passe par une fonction security definer : le club voit
  // le total sans voir qui le suit (vie privée des supporters).
  const [followers, posts] = await Promise.all([
    sb.rpc('club_follower_count', { p_team_id: teamId }),
    sb.from('club_posts').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
  ]);
  return { followers: followers.data ?? 0, posts: posts.count ?? 0 };
}

// -- données : messagerie fédération → club
async function listMyClubMessages(teamId) {
  const { data, error } = await sb.from('club_message_recipients').select('read_at, message:club_messages(*)').eq('team_id', teamId);
  if (error) throw error;
  return (data ?? []).filter((r) => r.message).sort((a, b) => (b.message?.created_at ?? '').localeCompare(a.message?.created_at ?? ''));
}
async function countUnreadClubMessages(teamId) {
  const { count } = await sb.from('club_message_recipients').select('message_id', { count: 'exact', head: true }).eq('team_id', teamId).is('read_at', null);
  return count ?? 0;
}
async function markClubMessagesRead(teamId) {
  await sb.rpc('mark_club_messages_read', { p_team_id: teamId });
}

// -- données : feuille de match (les 12 retenus par l'équipe)
async function getMatchLineup(matchId, teamId) {
  const [lineup, status] = await Promise.all([
    sb.from('match_lineups').select('player_id').eq('match_id', matchId).eq('team_id', teamId),
    sb.from('match_lineup_status').select('validated').eq('match_id', matchId).eq('team_id', teamId).maybeSingle(),
  ]);
  if (lineup.error) throw lineup.error;
  return { playerIds: (lineup.data ?? []).map((r) => r.player_id), validated: !!(status.data && status.data.validated) };
}
async function saveMatchLineup(matchId, teamId, playerIds) {
  const del = await sb.from('match_lineups').delete().eq('match_id', matchId).eq('team_id', teamId);
  if (del.error) throw del.error;
  if (playerIds.length) {
    const { error } = await sb.from('match_lineups').insert(playerIds.map((player_id) => ({ match_id: matchId, team_id: teamId, player_id })));
    if (error) throw error;
  }
}
async function setLineupValidated(matchId, teamId, validated) {
  const { error } = await sb.from('match_lineup_status').upsert(
    { match_id: matchId, team_id: teamId, validated, validated_at: validated ? new Date().toISOString() : null },
    { onConflict: 'match_id,team_id' },
  );
  if (error) throw error;
}

// -- données : discipline du club (sanctions publiques filtrées sur l'équipe)
async function listSanctionsForTeam(teamId) {
  const { data, error } = await sb.from('sanctions').select(SANCTION_SELECT).eq('team_id', teamId).order('decided_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ------------------------------------------------------- gabarits Espace club
const CHEVRON = '<svg class="mc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
const CLUB_NAV_ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  sheet: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h5"/>',
  megaphone: '<path d="M3 11v2a1 1 0 001 1h2l4 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M14 8a4 4 0 010 8"/>',
  ribbon: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>',
  warning: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  poll: '<path d="M6 20v-6M12 20V4M18 20v-9"/><path d="M3 20h18"/>',
  sponsor: '<path d="M3 7h18v12H3z"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>',
  gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-6 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
};
function clubBackHtml() {
  return `<a class="back-btn" href="#mon-club">${icoSvg('<path d="M15 18l-6-6 6-6"/>')}Mon club</a>`;
}
function clubGateHtml(msg) {
  return emptyHtml(session ? 'Aucun club rattaché' : 'Connexion requise', msg || (session
    ? 'Seule la fédération peut rattacher un compte à un club. Contactez-la pour obtenir votre délégation.'
    : 'Connectez-vous avec le compte que la fédération a rattaché à votre club.'), 'ball');
}
function clubNavRow(route, ico, title, sub, right) {
  return `<a class="roster-row" href="#${route}"><span class="mc-nav-ic">${icoSvg(ico)}</span><span class="mc-nav-txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${right}</a>`;
}
function postCardHtml(p, withDelete) {
  return `<div class="post-card">
    ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}
    <div class="body">${esc(p.body)}</div>
    <div class="post-foot"><span class="date">${fmtFullDate(p.created_at)}</span><span class="post-foot-actions"><button class="post-share" data-share-post="${p.id}" aria-label="Partager">${SHARE_ICON}Partager</button>${withDelete ? `<button class="mini-del" data-del="${p.id}" aria-label="Supprimer">✕</button>` : ''}</span></div>
  </div>`;
}
function msgCardHtml(r) {
  const m = r.message, unread = !r.read_at;
  return `<div class="msg-card${unread ? ' unread' : ''}">
    <div class="msg-head"><span class="msg-title">${esc(m.title)}</span>${unread ? '<span class="msg-new">Nouveau</span>' : ''}</div>
    <div class="msg-body">${esc(m.body)}</div>
    <div class="msg-date">${fmtFullDate(m.created_at)}</div>
  </div>`;
}
const LIC_STATUS = { valid: { label: 'Valide', cls: 'ok' }, pending: { label: 'En attente', cls: 'warn' }, suspended: { label: 'Suspendue', cls: 'bad' }, expired: { label: 'Expirée', cls: 'bad' } };
const LIC_ORDER = { suspended: 0, expired: 1, pending: 2, valid: 3 };
function licAvaHtml(pl) {
  return pl && pl.photo_url ? `<span class="lic-ava"><img src="${esc(pl.photo_url)}" alt=""></span>` : `<span class="lic-ava">${esc(initials(pl && pl.full_name ? pl.full_name : '—'))}</span>`;
}
function licCardHtml(l) {
  const s = LIC_STATUS[l.status] || { label: l.status, cls: 'mut' };
  const expMs = l.expires_at ? Date.parse(l.expires_at) : null;
  const soon = l.status === 'valid' && expMs != null && (expMs - Date.now() < 30 * 24 * 3600 * 1000);
  const dates = (l.issued_at || l.expires_at) ? `<div class="lic-dates">${l.issued_at ? `<span>Délivrée le ${fmtFullDate(l.issued_at)}</span>` : ''}${l.expires_at ? `<span${soon || l.status === 'expired' ? ' style="color:var(--danger)"' : ''}>Expire le ${fmtFullDate(l.expires_at)}${soon ? ' · bientôt' : ''}</span>` : ''}</div>` : '';
  return `<div class="lic-card"><div class="lic-row">${licAvaHtml(l.player)}<div class="lic-info"><b>${esc(l.player?.full_name || 'Joueur inconnu')}</b><span>${l.number ? ('N° ' + esc(l.number)) : 'Sans numéro'}${l.season?.name ? (' · ' + esc(l.season.name)) : ''}</span></div><span class="status-pill ${s.cls}">${esc(s.label)}</span></div>${dates}${l.note ? `<div class="lic-note">${esc(l.note)}</div>` : ''}</div>`;
}
const SAN_STATUS = { active: { label: 'En cours', cls: 'bad' }, served: { label: 'Purgée', cls: 'ok' }, cancelled: { label: 'Annulée', cls: 'mut' } };
function sanCardHtml(s) {
  const st = SAN_STATUS[s.status] || { label: s.status, cls: 'mut' };
  const meta = [SANCTION_LABELS[s.kind] || s.kind, s.games ? `${s.games} match(s)` : null, s.amount_gnf ? formatGnf(s.amount_gnf) : null].filter(Boolean).join(' · ');
  return `<div class="san-card"><div class="lic-row"><div class="lic-info"><b>${esc(s.player?.full_name || 'Équipe')}</b><span>${esc(meta)}</span></div><span class="status-pill ${st.cls}">${esc(st.label)}</span></div>${s.reason ? `<div class="lic-note">${esc(s.reason)}</div>` : ''}${s.decided_at ? `<div class="msg-date">${fmtFullDate(s.decided_at)}</div>` : ''}</div>`;
}

// ----------------------------------------------------------- écran « Mon club »
async function renderMonClub() {
  view.innerHTML = `<h1 class="view-title">Mon club</h1><p class="view-sub">Gérez votre effectif et la présentation du club.</p><div id="mcBody">${loadingHtml()}</div>`;
  if (!session) { $('#mcBody').innerHTML = clubGateHtml(); return; }
  const club = await resolveMyClub();
  const body = $('#mcBody'); if (!body) return;
  if (!club) { body.innerHTML = clubGateHtml(); return; }

  const [roster, unread, dash] = await Promise.all([
    safe(getTeamPlayers(club.id), []), safe(countUnreadClubMessages(club.id), 0), safe(getClubDashboard(club.id), null),
  ]);

  // carte d'identité (ce qui n'est pas modifiable est dit, pour éviter de chercher un bouton absent)
  const idCard = `<div class="mc-id"><div class="mc-id-row">${logoHtml(club)}<div><h2>${esc(club.name)}</h2><div class="sub">${[labelOf(TEAM_GENDERS, club.gender), esc(club.division), esc(club.city)].filter(Boolean).join(' · ') || 'Club'}</div></div></div><div class="mc-note">Le nom du club, sa division et son calendrier relèvent de la fédération. Vous gérez ici votre effectif et la présentation du club.</div></div>`;

  // tableau de bord
  const rankLabel = !dash || dash.rank == null ? '—' : (dash.rank === 1 ? '1er' : dash.rank + 'e');
  const st = dash && dash.standing;
  const record = st ? `${st.wins} V · ${st.losses} D · ${st.points} pts` : 'Pas encore classé';
  const sc = dash && dash.topScorer;
  const scorerTile = sc
    ? `<a class="mc-tile" href="#player/${sc.player_id}"><span class="k">Meilleur marqueur</span><span class="v">${Number(sc.ppg).toFixed(1)}<small>pts/m</small></span><span class="s">${esc(sc.full_name)}</span></a>`
    : `<div class="mc-tile"><span class="k">Meilleur marqueur</span><span class="v">—</span><span class="s">Aucune statistique</span></div>`;
  const tiles = `<div class="mc-tiles"><div class="mc-tile"><span class="k">Classement</span><span class="v">${rankLabel}</span><span class="s">${esc(record)}</span></div>${scorerTile}</div>`;
  const matchesBlock = `${dash && dash.nextMatch ? `<div class="mc-label">Prochain match</div>${matchCardHtml(dash.nextMatch)}` : ''}${dash && dash.lastMatch ? `<div class="mc-label">Dernier résultat</div>${matchCardHtml(dash.lastMatch)}` : ''}`;

  // navigation vers les sous-écrans
  const nav = `<div class="roster mc-nav">
    ${clubNavRow('mon-club-messages', CLUB_NAV_ICONS.mail, 'Messages', 'Annonces de la fédération', unread > 0 ? `<span class="mc-badge">${unread}</span>` : CHEVRON)}
    ${clubNavRow('mon-club-feuille', CLUB_NAV_ICONS.sheet, 'Feuille de match', 'Composez vos 12 pour un match à venir', CHEVRON)}
    ${clubNavRow('mon-club-publications', CLUB_NAV_ICONS.megaphone, 'Publications', 'Publiez pour vos abonnés et voyez votre audience', CHEVRON)}
    ${clubNavRow('mon-club-licences', CLUB_NAV_ICONS.ribbon, 'Licences de mes joueurs', 'État et expiration des licences', CHEVRON)}
    ${clubNavRow('mon-club-discipline', CLUB_NAV_ICONS.warning, 'Discipline', 'Sanctions et amendes du club', CHEVRON)}
    ${clubNavRow('mon-club-sondages', CLUB_NAV_ICONS.poll, 'Sondages', 'Posez des questions à vos abonnés', CHEVRON)}
    ${clubNavRow('mon-club-sponsors', CLUB_NAV_ICONS.sponsor, 'Sponsors', 'Vos partenaires sur la page du club', CHEVRON)}
    ${clubNavRow('mon-club-galerie', CLUB_NAV_ICONS.gallery, 'Galerie photos', 'La vitrine photo de votre club', CHEVRON)}
    ${clubNavRow('mon-club-evenements', CLUB_NAV_ICONS.calendar, 'Événements', 'Annoncez vos rendez-vous, gérez les inscrits', CHEVRON)}
  </div>`;

  // effectif
  const rosterRows = roster.length
    ? roster.map((p) => `<div class="roster-row"><span class="bx-num">${p.number ?? ''}</span><span class="rr-name">${esc(p.full_name)}</span><span class="rr-pos">${esc(p.position || 'Poste non précisé')}</span><span class="rr-actions"><button class="mini-btn" data-edit="${p.id}" aria-label="Modifier">${icoSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>')}</button><button class="mini-del" data-del="${p.id}" aria-label="Retirer">✕</button></span></div>`).join('')
    : '<div class="roster-row"><span class="rr-pos">Aucun joueur. Ajoutez votre premier joueur.</span></div>';

  // présentation
  const pres = `<form class="admin-form" id="mcPres" novalidate>
    ${adminFieldHtml({ k: 'logo_url', type: 'image', folder: 'teams', label: 'Logo du club' }, club.logo_url || '')}
    ${adminFieldHtml({ k: 'presentation', type: 'textarea', rows: 5, label: 'Présentation du club', placeholder: 'Histoire, palmarès, salle, ambiance… ce qui donne envie de suivre votre club.' }, club.presentation || '')}
    ${adminFieldHtml({ k: 'coach', type: 'text', label: 'Entraîneur', placeholder: 'Nom du coach' }, club.coach || '')}
    ${adminFieldHtml({ k: 'city', type: 'text', label: 'Ville', placeholder: 'Conakry' }, club.city || '')}
    ${adminFieldHtml({ k: 'founded_year', type: 'number', label: 'Année de fondation', placeholder: '1998' }, club.founded_year ?? '')}
    <div class="field"><label>Couleur du club</label><div class="color-swatches">${TEAM_COLORS_WEB.map((c) => `<button type="button" class="color-sw${(club.color || TEAM_COLORS_WEB[0]) === c ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div><input type="hidden" name="color" value="${esc(club.color || TEAM_COLORS_WEB[0])}"></div>
    <div class="form-actions"><button type="submit" class="btn">Enregistrer</button></div>
  </form>`;

  body.innerHTML = idCard + tiles + matchesBlock + nav
    + `<div class="block-head mc-sec"><h2>Effectif (${roster.length})</h2><button class="more" id="mcAddPlayer">+ Ajouter</button></div><div class="roster">${rosterRows}</div>`
    + `<div class="block-head mc-sec"><h2>Présentation du club</h2></div>${pres}`;

  // câblage effectif
  $('#mcAddPlayer').addEventListener('click', () => openClubPlayer(club, null));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openClubPlayer(club, roster.find((p) => p.id === b.dataset.edit))));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const p = roster.find((x) => x.id === b.dataset.del); if (!p) return;
    if (!window.confirm(`Retirer ${p.full_name} de l'effectif ?`)) return;
    try { await deletePlayer(p.id); toast('Joueur retiré'); renderMonClub(); } catch (e) { toast(errMsg(e)); }
  }));

  // câblage présentation
  const form = $('#mcPres');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  const hiddenColor = form.querySelector('[name=color]');
  form.querySelectorAll('.color-sw').forEach((sw) => sw.addEventListener('click', () => {
    hiddenColor.value = sw.dataset.color;
    form.querySelectorAll('.color-sw').forEach((x) => x.classList.toggle('active', x === sw));
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
      const fy = parseInt(form.querySelector('[name=founded_year]').value, 10);
      await updateMyClub({
        team_id: club.id,
        coach: form.querySelector('[name=coach]').value.trim() || null,
        city: form.querySelector('[name=city]').value.trim() || null,
        color: hiddenColor.value || null,
        logo_url: form.querySelector('[name=logo_url]').value || null,
        presentation: form.querySelector('[name=presentation]').value.trim() || null,
        founded_year: Number.isFinite(fy) ? fy : null,
      });
      await safe(loadMyClubs(), null); // rafraîchit la carte d'identité
      toast('Fiche du club enregistrée');
      renderMonClub();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
}

// formulaire joueur (volontairement plus court que la fiche fédération :
// ni nationalité ni club — changer de club est un transfert).
function openClubPlayer(club, player) {
  const editing = !!player;
  const fields = [
    { k: 'photo_url', type: 'image', folder: 'players', label: 'Photo du joueur' },
    { k: 'full_name', type: 'text', label: 'Nom complet', required: true, placeholder: 'Prénom et nom' },
    { k: 'number', type: 'number', label: 'Numéro', placeholder: '7' },
    { k: 'height_cm', type: 'number', label: 'Taille (cm)', placeholder: '190' },
    { k: 'birth_date', type: 'date', label: 'Date de naissance' },
    { k: 'position', type: 'select', label: 'Poste', options: POSITIONS_WEB.map((p) => ({ value: p, label: p })) },
  ];
  view.innerHTML = `<a class="back-btn" id="cpBack" role="button" tabindex="0">${icoSvg('<path d="M15 18l-6-6 6-6"/>')}Mon club</a>
    <h1 class="view-title">${editing ? 'Modifier' : 'Nouveau'} · joueur</h1>
    <form class="admin-form" id="cpForm" novalidate>${fields.map((f) => adminFieldHtml(f, editing ? player[f.k] : undefined)).join('')}
      <div class="form-actions"><button type="button" class="btn btn-ghost" id="cpCancel">Annuler</button><button type="submit" class="btn">${editing ? 'Enregistrer' : 'Créer'}</button></div>
    </form>`;
  $('#cpBack').addEventListener('click', renderMonClub);
  $('#cpBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderMonClub(); } });
  $('#cpCancel').addEventListener('click', renderMonClub);
  const form = $('#cpForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = collectCrudForm(fields, form);
    if (!patch.full_name) { toast('« Nom complet » est obligatoire'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
      await saveClubPlayer(club.id, {
        id: player && player.id, full_name: patch.full_name,
        number: patch.number != null ? patch.number : null, position: patch.position || null,
        height_cm: patch.height_cm != null ? patch.height_cm : null, birth_date: patch.birth_date || null,
        photo_url: patch.photo_url || null,
      });
      toast(editing ? 'Joueur modifié' : 'Joueur ajouté');
      renderMonClub();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
}

// -------------------------------------------------------- sous-écran publications
async function renderClubPublications() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Publications</h1><p class="view-sub">Publiez pour vos abonnés et suivez votre audience.</p><div id="pubBody">${loadingHtml()}</div>`;
  const b = $('#pubBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const [posts, audience] = await Promise.all([safe(listTeamPosts(club.id), []), safe(getClubAudience(club.id), { followers: 0, posts: 0 })]);
  b.innerHTML = `
    <div class="mc-tiles"><div class="mc-tile"><span class="k">Abonnés</span><span class="v">${audience.followers}</span></div><div class="mc-tile"><span class="k">Publications</span><span class="v">${audience.posts}</span></div></div>
    <form class="admin-form" id="pubForm" novalidate>
      <div class="field"><label>Nouvelle publication</label><textarea name="body" rows="4" placeholder="Un message pour vos abonnés…"></textarea></div>
      ${adminFieldHtml({ k: 'image_url', type: 'image', folder: 'posts', label: 'Photo (facultative)' }, '')}
      <div class="form-actions"><button type="submit" class="btn">Publier</button></div>
    </form>
    <div class="block-head mc-sec"><h2>Mes publications (${posts.length})</h2></div>
    <div id="pubList">${posts.length ? posts.map((p) => postCardHtml(p, true)).join('') : emptyHtml('Aucune publication', 'Vos publications apparaîtront ici.', 'news')}</div>`;
  const form = $('#pubForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bodyVal = form.querySelector('[name=body]').value.trim();
    if (!bodyVal) { toast('Écrivez un message avant de publier'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Publication…';
    try {
      await createClubPost({ team_id: club.id, author_id: session.user.id, body: bodyVal, image_url: form.querySelector('[name=image_url]').value || null });
      notifyClubPost(club, bodyVal); // prévient les abonnés (Web Push), sans bloquer
      toast('Publication envoyée');
      renderClubPublications();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
  b.querySelectorAll('#pubList [data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!window.confirm('Supprimer cette publication ?\nCette action est définitive.')) return;
    try { await deleteClubPost(btn.dataset.del); toast('Publication supprimée'); renderClubPublications(); } catch (e) { toast(errMsg(e)); }
  }));
  b.querySelectorAll('#pubList [data-share-post]').forEach((btn) => btn.addEventListener('click', () => {
    const p = posts.find((x) => x.id === btn.dataset.sharePost); if (p) openShareCard(postShareSpec(club, p));
  }));
}

// -------------------------------------------------------- sous-écran messages
async function renderClubMessages() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Messages</h1><p class="view-sub">Les annonces de la fédération.</p><div id="msgBody">${loadingHtml()}</div>`;
  const b = $('#msgBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const rows = await safe(listMyClubMessages(club.id), []);
  markClubMessagesRead(club.id).catch(() => {}); // accusé de lecture, sans recharger : les badges « Nouveau » restent pour cette visite
  b.innerHTML = rows.length ? rows.map(msgCardHtml).join('') : emptyHtml('Aucun message', 'Les messages de la fédération apparaîtront ici.', 'inbox');
}

// -------------------------------------------------------- sous-écran licences
async function renderClubLicences() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Licences</h1><p class="view-sub">Délivrées par la fédération. Consultation seule.</p><div id="licBody">${loadingHtml()}</div>`;
  const b = $('#licBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const rows = await safe(listClubLicenses(club.id), null);
  if (rows === null) { b.innerHTML = errorHtml(); return; }
  const sorted = rows.slice().sort((a, b2) => (LIC_ORDER[a.status] - LIC_ORDER[b2.status]) || (a.player?.full_name || '').localeCompare(b2.player?.full_name || ''));
  b.innerHTML = sorted.length ? sorted.map(licCardHtml).join('') : emptyHtml('Aucune licence', 'Les licences délivrées par la fédération pour votre effectif apparaîtront ici.', 'inbox');
}

// -------------------------------------------------------- sous-écran discipline
async function renderClubDiscipline() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Discipline</h1><p class="view-sub">Les sanctions et amendes de votre club.</p><div id="disBody">${loadingHtml()}</div>`;
  const b = $('#disBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const rows = await safe(listSanctionsForTeam(club.id), null);
  if (rows === null) { b.innerHTML = errorHtml(); return; }
  b.innerHTML = rows.length ? rows.map(sanCardHtml).join('') : emptyHtml('Aucune sanction', "Votre club n'a aucune sanction enregistrée. Continuez comme ça !", 'trophy');
}

// -------------------------------------------------------- sous-écran feuille de match
async function renderClubFeuille() {
  const MAX = 12;
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Feuille de match</h1><p class="view-sub">Disponibilités, composition des 12, scouting et impression.</p><div id="feBody">${loadingHtml()}</div>`;
  const host = $('#feBody'); if (!host) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { host.innerHTML = clubGateHtml(); return; }
  const [matches, roster] = await Promise.all([safe(getTeamMatches(club.id), []), safe(getTeamPlayers(club.id), [])]);
  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const state = { matchId: null, sel: new Set(), validated: false, avail: new Map(), busy: false };
  const currentMatch = () => upcoming.find((m) => m.id === state.matchId) || null;
  const opponentOf = (m) => (m.home_team_id === club.id ? m.away_team : m.home_team);

  function pickerHtml() {
    if (!upcoming.length) return '<div class="mc-note" style="margin:0">Aucun match à venir programmé.</div>';
    return upcoming.map((m) => {
      const on = state.matchId === m.id;
      const opp = opponentOf(m);
      return `<button class="fe-pick${on ? ' active' : ''}" data-match="${m.id}">${logoHtml(opp)}<span class="info"><b>contre ${esc(opp?.name || 'Adversaire')}</b><span>${fmtDate(m.scheduled_at)} · ${fmtTime(m.scheduled_at) || '—'}${m.competition?.name ? ' · ' + esc(m.competition.name) : ''}</span></span>${on ? icoSvg('<path d="M6 15l6-6 6 6"/>') : icoSvg('<path d="M6 9l6 6 6-6"/>')}</button>`;
    }).join('');
  }
  function availHtml() {
    if (!roster.length) return '';
    const rows = roster.map((p) => {
      const st = state.avail.get(p.id) || 'available';
      const seg = AVAIL.map((a) => `<button class="av-seg${st === a.v ? ' active ' + a.cls : ''}" data-avail="${p.id}" data-status="${a.v}"${state.validated ? ' disabled' : ''}>${a.label}</button>`).join('');
      return `<div class="av-row"><span class="av-name">${p.number != null ? '#' + p.number + ' ' : ''}${esc(p.full_name)}</span><div class="av-seg-wrap">${seg}</div></div>`;
    }).join('');
    return `<div class="block-head mc-sec"><h2>Disponibilités</h2></div><div class="av-list">${rows}</div>`;
  }
  function sheetHtml() {
    if (!state.matchId) return '';
    const m = currentMatch();
    const opp = opponentOf(m);
    const validatedBanner = state.validated ? `<div class="fe-validated">${icoSvg('<path d="M20 6L9 17l-5-5"/>')}<span>Feuille validée. Déverrouillez pour la modifier.</span></div>` : '';
    const players = roster.length
      ? roster.map((p) => {
          const on = state.sel.has(p.id);
          const st = state.avail.get(p.id) || 'available';
          const badge = st !== 'available' ? `<span class="status-pill ${availMeta(st).cls} fe-badge">${availMeta(st).label}</span>` : '';
          return `<button class="fe-player${on ? ' on' : ''}" data-player="${p.id}"${state.validated ? ' disabled' : ''}><span class="fe-check">${icoSvg('<path d="M20 6L9 17l-5-5"/>')}</span><span class="fe-info"><b>${p.number != null ? '#' + p.number + ' ' : ''}${esc(p.full_name)}</b><span>${esc(p.position || 'Poste non précisé')}</span></span>${badge}</button>`;
        }).join('')
      : '<div class="mc-note" style="margin:0">Ajoutez d\'abord des joueurs à votre effectif.</div>';
    const actions = state.validated
      ? `<button class="btn btn-ghost" data-act="unlock">Déverrouiller</button>`
      : `<button class="btn btn-ghost" data-act="save">Enregistrer</button><button class="btn" data-act="validate">Valider ma feuille</button>`;
    const tools = `<div class="fe-tools">${opp ? `<a class="btn btn-ghost sm" href="#scouting/${opp.id}">${icoSvg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')}Scouter l'adversaire</a>` : ''}<button class="btn btn-ghost sm" data-act="print">${icoSvg('<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/>')}Imprimer / PDF</button></div>`;
    return availHtml() + `<div class="block-head mc-sec"><h2>Mes 12 (${state.sel.size}/${MAX})</h2></div>${validatedBanner}<div class="fe-players">${players}</div><div class="form-actions" style="margin-top:14px">${actions}</div>${tools}`;
  }
  function paint() {
    host.innerHTML = `<div class="block-head mc-sec" style="margin-top:0"><h2>Match à préparer</h2></div><div class="fe-picks">${pickerHtml()}</div>${sheetHtml()}`;
    host.querySelectorAll('.fe-pick').forEach((btn) => btn.addEventListener('click', () => pick(btn.dataset.match)));
    host.querySelectorAll('.fe-player').forEach((btn) => btn.addEventListener('click', () => toggle(btn.dataset.player)));
    host.querySelectorAll('[data-avail]').forEach((btn) => btn.addEventListener('click', () => setAvail(btn.dataset.avail, btn.dataset.status)));
    host.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => act(btn.dataset.act)));
  }
  async function pick(id) {
    if (state.matchId === id) { state.matchId = null; paint(); return; }
    state.matchId = id; state.sel = new Set(); state.validated = false; state.avail = new Map(); paint();
    const [lu, av] = await Promise.all([safe(getMatchLineup(id, club.id), { playerIds: [], validated: false }), safe(getMatchAvailability(id, club.id), [])]);
    if (state.matchId !== id) return; // l'utilisateur a changé de match entre-temps
    state.sel = new Set(lu.playerIds); state.validated = lu.validated;
    state.avail = new Map(av.map((r) => [r.player_id, r.status])); paint();
  }
  function toggle(id) {
    if (state.validated) return;
    if (state.sel.has(id)) state.sel.delete(id);
    else if (state.sel.size < MAX) state.sel.add(id);
    else { toast(`12 joueurs maximum`); return; }
    paint();
  }
  async function setAvail(playerId, status) {
    if (state.validated) return;
    const prev = state.avail.get(playerId);
    state.avail.set(playerId, status); paint();
    try { await setPlayerAvailability(state.matchId, club.id, playerId, status); }
    catch (e) { if (prev) state.avail.set(playerId, prev); else state.avail.delete(playerId); paint(); toast(errMsg(e)); }
  }
  async function act(kind) {
    if (kind === 'print') { const sel = roster.filter((p) => state.sel.has(p.id)); printMatchSheet(club, currentMatch(), sel, state.avail); return; }
    if (state.busy || !state.matchId) return;
    state.busy = true;
    try {
      if (kind === 'unlock') { await setLineupValidated(state.matchId, club.id, false); state.validated = false; toast('Feuille déverrouillée'); }
      else {
        await saveMatchLineup(state.matchId, club.id, [...state.sel]);
        if (kind === 'validate') { await setLineupValidated(state.matchId, club.id, true); state.validated = true; toast('Feuille validée'); }
        else toast('Feuille enregistrée');
      }
      paint();
    } catch (e) { toast(errMsg(e)); }
    finally { state.busy = false; }
  }
  paint();
}

// =========================================================================
// RECORDS & STATISTIQUES D'ÉQUIPE — vues publiques (game_highs,
// team_season_stats, team_advanced_stats), lecture seule.
// =========================================================================
function round1(n) { return Math.round(n * 10) / 10; }

// -- données : records de la saison (meilleures perfs individuelles sur un match)
const RECORD_COLS = [
  { key: 'points', label: 'Points', unit: 'pts', ic: '<path d="M12 2C9 6 8 9 12 13c4-4 3-7 0-11z"/><path d="M6.5 12.5a5.5 5.5 0 1011 0c0-2-1-3.6-2.2-4.6"/>' },
  { key: 'rebounds', label: 'Rebonds', unit: 'reb', ic: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18"/>' },
  { key: 'assists', label: 'Passes', unit: 'pd', ic: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 11l8-5M8 13l8 5"/>' },
  { key: 'steals', label: 'Interceptions', unit: 'int', ic: '<path d="M6 11V7a2 2 0 014 0M10 11V5a2 2 0 014 0v6M14 11V7a2 2 0 014 0v6a6 6 0 01-6 6 6 6 0 01-6-6v-1l-2-3 1.5-1L6 11"/>' },
  { key: 'blocks', label: 'Contres', unit: 'ctr', ic: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
  { key: 'three_made', label: 'Tirs à 3 pts', unit: '3 pts', ic: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },
];
async function listGameHighs(column, limit) {
  const { data, error } = await sb.from('game_highs').select('*').gt(column, 0).order(column, { ascending: false }).order('scheduled_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return attachOpponents(data ?? []);
}
async function attachOpponents(rows) {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.match_id))];
  const { data } = await sb.from('matches').select('id, home_team_id, away_team_id, home_team:teams!home_team_id(name, short_name), away_team:teams!away_team_id(name, short_name)').in('id', ids);
  const byId = {}; (data ?? []).forEach((m) => { byId[m.id] = m; });
  return rows.map((r) => {
    const m = byId[r.match_id];
    // team_id vient du club actuel du joueur : après un transfert il peut ne
    // correspondre à aucune des deux équipes du match, on n'invente rien.
    const other = !m || (r.team_id !== m.home_team_id && r.team_id !== m.away_team_id) ? null : (r.team_id === m.home_team_id ? m.away_team : m.home_team);
    return { ...r, opponent: other ? (other.short_name || other.name) : null };
  });
}
async function listSeasonRecords(limit = 6) {
  const lists = await Promise.all(RECORD_COLS.map((c) => listGameHighs(c.key, limit)));
  return RECORD_COLS.map((c, i) => ({ ...c, rows: lists[i] }));
}
function recSubtitle(r) {
  return [r.team_short, r.opponent ? 'vs ' + r.opponent : null, fmtDate(r.scheduled_at)].filter(Boolean).join(' · ');
}
function recCardHtml(cat) {
  const best = cat.rows[0], rest = cat.rows.slice(1);
  const bestAva = best.photo_url
    ? `<span class="rec-ava" style="background:${esc(best.team_color || 'var(--teal)')}"><img src="${esc(best.photo_url)}" alt=""></span>`
    : `<span class="rec-ava" style="background:${esc(best.team_color || 'var(--teal)')}">${esc(initials(best.full_name))}</span>`;
  return `<div class="rec-card">
    <div class="rec-head">${icoSvg(cat.ic)}<span>${esc(cat.label)}</span></div>
    <a class="rec-best" href="#player/${best.player_id}">${bestAva}<div class="rec-best-info"><b>${esc(best.full_name)}</b><span>${esc(recSubtitle(best))}</span></div><div class="rec-best-val"><b>${best[cat.key]}</b><span>${esc(cat.unit)}</span></div></a>
    ${rest.length ? `<div class="rec-rest">${rest.map((r, i) => `<a class="rec-row" href="#player/${r.player_id}"><span class="rec-rk">${i + 2}</span><div class="rec-row-info"><b>${esc(r.full_name)}</b><span>${esc(recSubtitle(r))}</span></div><span class="rec-row-val">${r[cat.key]}</span></a>`).join('')}</div>` : ''}
  </div>`;
}
async function renderRecords() {
  view.innerHTML = `<h1 class="view-title">Records de la saison</h1><p class="view-sub">Meilleures performances individuelles sur un match.</p><div id="recBody">${loadingHtml()}</div>`;
  const cats = await safe(listSeasonRecords(6), null);
  const b = $('#recBody'); if (!b) return;
  if (cats === null) { b.innerHTML = errorHtml(); return; }
  const shown = cats.filter((c) => c.rows.length);
  b.innerHTML = shown.length ? shown.map(recCardHtml).join('') : emptyHtml('Aucun record', 'Les records apparaîtront dès que des box scores auront été saisis.', 'trophy');
}

// -- données : bilans d'équipe
function normalizeTS(r) {
  return { ...r, games: Number(r.games), wins: Number(r.wins), losses: Number(r.losses), pts_for: Number(r.pts_for), pts_against: Number(r.pts_against), diff: Number(r.diff), best_score: Number(r.best_score) };
}
function mergeTSByTeam(rows) {
  // Les moyennes sont pondérées par le nombre de matchs : additionner deux
  // moyennes de compétitions au volume différent fausserait le bilan.
  const acc = new Map();
  for (const r of rows) {
    const cur = acc.get(r.team_id);
    if (!cur) { acc.set(r.team_id, { row: { ...r, competition_id: null }, pf: r.pts_for * r.games, pa: r.pts_against * r.games }); continue; }
    cur.row.games += r.games; cur.row.wins += r.wins; cur.row.losses += r.losses;
    cur.row.best_score = Math.max(cur.row.best_score, r.best_score);
    cur.pf += r.pts_for * r.games; cur.pa += r.pts_against * r.games;
  }
  return [...acc.values()].map(({ row, pf, pa }) => {
    const g = row.games || 1;
    row.pts_for = round1(pf / g); row.pts_against = round1(pa / g); row.diff = round1(row.pts_for - row.pts_against);
    return row;
  });
}
async function listTeamSeasonStats(competitionId) {
  let q = sb.from('team_season_stats').select('*');
  if (competitionId) q = q.eq('competition_id', competitionId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map(normalizeTS);
  return competitionId ? rows : mergeTSByTeam(rows);
}
async function listTeamAdvancedStats() {
  const { data, error } = await sb.from('team_advanced_stats').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, games: Number(r.games), efg_pct: Number(r.efg_pct), tov_pct: Number(r.tov_pct), orb_pct: Number(r.orb_pct), ft_rate: Number(r.ft_rate), ppg: Number(r.ppg) }));
}

// -- écran : statistiques des équipes (attaque / défense / différentiel)
let seMode = 'attaque';
let seComp; // undefined = pas encore initialisé → « toutes »
function seValue(r) { return seMode === 'attaque' ? r.pts_for : seMode === 'defense' ? r.pts_against : r.diff; }
async function renderStatsEquipes() {
  view.innerHTML = `<h1 class="view-title">Statistiques des équipes</h1><p class="view-sub">Attaque, défense et différentiel — toujours par match.</p><div id="seModes"></div><div id="seComps"></div><div id="seBody">${loadingHtml()}</div>`;
  const modes = [['attaque', 'Attaque'], ['defense', 'Défense'], ['diff', 'Différentiel']];
  const mw = $('#seModes'); mw.className = 'segmented';
  mw.innerHTML = modes.map(([id, l]) => `<button class="seg ${seMode === id ? 'active' : ''}" data-m="${id}">${l}</button>`).join('');
  mw.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => { seMode = btn.dataset.m; renderStatsEquipes(); }));

  const comps = await safe(listCompetitions(), []);
  if (comps.length) {
    const cw = $('#seComps'); cw.className = 'segmented';
    cw.innerHTML = [`<button class="seg ${!seComp ? 'active' : ''}" data-c="">Toutes les compétitions</button>`]
      .concat(comps.map((c) => `<button class="seg ${seComp === c.id ? 'active' : ''}" data-c="${c.id}">${esc(c.name)}</button>`)).join('');
    cw.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => { seComp = btn.dataset.c || undefined; renderStatsEquipes(); }));
  }

  const stats = await safe(listTeamSeasonStats(seComp || null), null);
  const b = $('#seBody'); if (!b) return;
  if (stats === null) { b.innerHTML = errorHtml(); return; }
  const rows = stats.slice().sort((a, b2) => seMode === 'defense' ? seValue(a) - seValue(b2) : seValue(b2) - seValue(a));
  if (!rows.length) { b.innerHTML = emptyHtml('Aucune statistique', 'Les bilans apparaîtront dès que des matchs auront été joués.', 'trophy'); return; }
  const scale = Math.max(1, ...rows.map((r) => Math.abs(seValue(r))));
  const legend = seMode === 'attaque' ? 'Points marqués par match' : seMode === 'defense' ? 'Points encaissés par match' : 'Différence de points par match';
  const centered = seMode === 'diff';
  b.innerHTML = `<p class="view-sub" style="margin-bottom:12px">${legend}</p><div class="se-card">${rows.map((r, i) => {
    const v = seValue(r), ratio = Math.min(1, Math.abs(v) / scale), positive = v >= 0;
    const barColor = centered ? (positive ? 'var(--green)' : 'var(--red)') : seMode === 'defense' ? 'var(--teal)' : 'var(--accent)';
    const w = (centered ? ratio * 50 : ratio * 100).toFixed(1) + '%';
    const pos = centered ? (positive ? 'left:50%' : 'right:50%') : 'left:0';
    const team = { name: r.team_name, short_name: r.short_name, color: r.color };
    const valTxt = (centered && positive ? '+' : '') + v;
    return `<a class="se-row" href="#team/${r.team_id}"><div class="se-top"><span class="se-rk${i < 3 ? ' top' : ''}">${i + 1}</span>${logoHtml(team, 'mlogo sm')}<span class="se-name"><b>${esc(r.team_name)}</b><span>${r.games} matchs · ${r.wins} V · ${r.losses} D${seMode === 'attaque' ? ' · record ' + r.best_score + ' pts' : ''}</span></span><span class="se-val"${centered && !positive ? ' style="color:var(--red)"' : ''}>${valTxt}</span></div><div class="se-bar"><span class="se-fill" style="${pos};width:${w};background:${barColor}"></span></div></a>`;
  }).join('')}</div>`;
}

// -- écran : statistiques avancées (four factors)
const ADV_METRICS = [
  { id: 'efg_pct', label: '% de tir effectif', hint: 'Réussite au tir, avec prime aux 3 points' },
  { id: 'tov_pct', label: 'Taux de balles perdues', hint: "Moins c'est mieux", lower: true },
  { id: 'orb_pct', label: 'Rebonds offensifs', hint: 'Secondes chances captées' },
  { id: 'ft_rate', label: 'Lancers francs', hint: 'Fréquence des lancers francs' },
];
let saMetric = 'efg_pct';
async function renderStatsAvancees() {
  view.innerHTML = `<h1 class="view-title">Statistiques avancées</h1><p class="view-sub">Les « four factors », calculés sur les box scores de la saison.</p><div id="saModes"></div><div id="saBody">${loadingHtml()}</div>`;
  const mw = $('#saModes'); mw.className = 'segmented';
  mw.innerHTML = ADV_METRICS.map((m) => `<button class="seg ${saMetric === m.id ? 'active' : ''}" data-m="${m.id}">${esc(m.label)}</button>`).join('');
  mw.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => { saMetric = btn.dataset.m; renderStatsAvancees(); }));

  const data = await safe(listTeamAdvancedStats(), null);
  const b = $('#saBody'); if (!b) return;
  if (data === null) { b.innerHTML = errorHtml(); return; }
  const cur = ADV_METRICS.find((m) => m.id === saMetric);
  const rows = data.slice().sort((a, b2) => cur.lower ? a[saMetric] - b2[saMetric] : b2[saMetric] - a[saMetric]);
  if (!rows.length) { b.innerHTML = emptyHtml('Aucune statistique', 'Les indicateurs avancés apparaîtront après quelques matchs.', 'trophy'); return; }
  b.innerHTML = `<p class="view-sub" style="margin-bottom:12px">${esc(cur.hint)}</p><div class="se-card">${rows.map((r, i) => {
    const team = { name: r.team_name, short_name: r.short_name, color: r.color };
    return `<a class="se-row" href="#team/${r.team_id}"><div class="se-top"><span class="se-rk${i < 3 ? ' top' : ''}">${i + 1}</span>${logoHtml(team, 'mlogo sm')}<span class="se-name"><b>${esc(r.team_name)}</b><span>${r.games} matchs</span></span><span class="se-val">${r[saMetric]}%</span></div></a>`;
  }).join('')}</div><p class="view-sub" style="margin-top:14px;font-size:12px">eFG% = (paniers + 0,5 × 3pts) / tentatives. Indicateurs calculés sur les box scores de la saison.</p>`;
}

// =========================================================================
// CARTE DES TIRS (shot chart) — s'insère dans la page d'un match. Repère
// normalisé 0–100 partagé avec la saisie mobile (panier ancré à (50, 6)) : un
// point retombe exactement là où il a été saisi. Reste invisible tant qu'aucun
// tir n'a été enregistré (les tirs se saisissent depuis l'app mobile).
// =========================================================================
const CWIDTH_M = 15, CDEPTH_M = 14, CTHREE_M = 6.75;
const cux = (m) => (m / CWIDTH_M) * 100;
const cuy = (m) => (m / CDEPTH_M) * 100;
const COURT_B = { x: 50, y: 6 };
const CGEO = {
  paintHalf: cux(2.45), paintDepth: cuy(5.8),
  ftRx: cux(1.8), ftRy: cuy(1.8),
  restrictedRx: cux(1.25), restrictedRy: cuy(1.25),
  threeRx: cux(CTHREE_M), threeRy: cuy(CTHREE_M),
  cornerX: cux(0.9),
  cornerY: COURT_B.y + cuy(Math.sqrt(CTHREE_M * CTHREE_M - (CWIDTH_M / 2 - 0.9) * (CWIDTH_M / 2 - 0.9))),
  hoopRx: cux(0.225), hoopRy: cuy(0.225),
  boardHalf: cux(0.9), boardY: COURT_B.y - cuy(0.375),
  centerRx: cux(1.8), centerRy: cuy(1.8),
};
function distanceToBasket(x, y) {
  const dx = ((Number(x) - COURT_B.x) / 100) * CWIDTH_M;
  const dy = ((Number(y) - COURT_B.y) / 100) * CDEPTH_M;
  return Math.hypot(dx, dy);
}
function isPaint(x, y) {
  return Number(x) >= COURT_B.x - CGEO.paintHalf && Number(x) <= COURT_B.x + CGEO.paintHalf && Number(y) <= CGEO.paintDepth;
}
const SHOT_ZONE_LABELS = { rim: 'Sous le panier', paint: 'Raquette', mid: 'Mi-distance', three: '3 points', ft: 'Lancers francs' };
const SHOT_ZONE_ORDER = ['rim', 'paint', 'mid', 'three', 'ft'];
function shotZone(s) {
  const pts = Number(s.points);
  if (pts === 1) return 'ft';
  if (pts === 3) return 'three';
  if (distanceToBasket(s.x, s.y) <= 1.5) return 'rim';
  return isPaint(s.x, s.y) ? 'paint' : 'mid';
}
function shotZoneSummary(shots) {
  const acc = {}; SHOT_ZONE_ORDER.forEach((z) => { acc[z] = { made: 0, att: 0 }; });
  for (const s of shots) { const z = shotZone(s); acc[z].att += 1; if (s.made) acc[z].made += 1; }
  return SHOT_ZONE_ORDER.map((z) => ({ zone: z, label: SHOT_ZONE_LABELS[z], made: acc[z].made, att: acc[z].att, pct: acc[z].att === 0 ? 0 : Math.round((acc[z].made / acc[z].att) * 100) }));
}
function pctColor(p) { return p >= 50 ? 'var(--green)' : p >= 33 ? 'var(--flag-yellow)' : 'var(--red)'; }
async function listShots(matchId) {
  const { data, error } = await sb.from('shots').select('*, player:players(id, full_name, number, team_id)').eq('match_id', matchId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
function courtSvg() {
  const g = CGEO, bx = COURT_B.x, by = COURT_B.y, L = 'var(--border-strong)', A = 'var(--accent)', s = 'vector-effect="non-scaling-stroke"';
  return `<svg class="court-svg" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="100" height="100" rx="1.6" fill="var(--surface)" stroke="${L}" stroke-width="1.2" ${s}/>
    <rect x="${bx - g.paintHalf}" y="0" width="${g.paintHalf * 2}" height="${g.paintDepth}" fill="var(--surface-2)" stroke="${L}" stroke-width="1.2" ${s}/>
    <ellipse cx="${bx}" cy="${g.paintDepth}" rx="${g.ftRx}" ry="${g.ftRy}" fill="none" stroke="${L}" stroke-width="1.2" ${s}/>
    <path d="M ${bx - g.restrictedRx} ${by} A ${g.restrictedRx} ${g.restrictedRy} 0 0 0 ${bx + g.restrictedRx} ${by}" fill="none" stroke="${L}" stroke-width="1.2" ${s}/>
    <line x1="${g.cornerX}" y1="0" x2="${g.cornerX}" y2="${g.cornerY}" stroke="${L}" stroke-width="1.2" ${s}/>
    <line x1="${100 - g.cornerX}" y1="0" x2="${100 - g.cornerX}" y2="${g.cornerY}" stroke="${L}" stroke-width="1.2" ${s}/>
    <path d="M ${g.cornerX} ${g.cornerY} A ${g.threeRx} ${g.threeRy} 0 0 0 ${100 - g.cornerX} ${g.cornerY}" fill="none" stroke="${L}" stroke-width="1.2" ${s}/>
    <path d="M ${bx - g.centerRx} 100 A ${g.centerRx} ${g.centerRy} 0 0 1 ${bx + g.centerRx} 100" fill="none" stroke="${L}" stroke-width="1.2" ${s}/>
    <line x1="${bx - g.boardHalf}" y1="${g.boardY}" x2="${bx + g.boardHalf}" y2="${g.boardY}" stroke="${A}" stroke-width="1.7" stroke-linecap="round" ${s}/>
    <line x1="${bx}" y1="${g.boardY}" x2="${bx}" y2="${by}" stroke="${A}" stroke-width="1.2" ${s}/>
    <ellipse cx="${bx}" cy="${by}" rx="${g.hoopRx}" ry="${g.hoopRy}" fill="none" stroke="${A}" stroke-width="1.45" ${s}/>
  </svg>`;
}
async function fillShotChart(m) {
  const slot = $('#shotsSlot'); if (!slot) return;
  const shots = await safe(listShots(m.id), []);
  if ($('#shotsSlot') !== slot) return; // l'utilisateur a changé de page
  if (!shots.length) return; // discret : aucun bloc tant qu'aucun tir n'a été saisi
  const ALLV = 'all';
  const state = { team: ALLV, player: ALLV };
  const court = courtSvg();
  function paint() {
    const byTeam = state.team === ALLV ? shots : shots.filter((s) => s.team_id === state.team);
    const shown = state.player === ALLV ? byTeam : byTeam.filter((s) => s.player && s.player.id === state.player);
    const teamChips = (m.home_team_id && m.away_team_id)
      ? `<div class="segmented sc-seg" data-kind="team"><button class="seg ${state.team === ALLV ? 'active' : ''}" data-v="${ALLV}">Les deux</button><button class="seg ${state.team === m.home_team_id ? 'active' : ''}" data-v="${m.home_team_id}">${esc(m.home_team?.short_name || m.home_team?.name || 'Domicile')}</button><button class="seg ${state.team === m.away_team_id ? 'active' : ''}" data-v="${m.away_team_id}">${esc(m.away_team?.short_name || m.away_team?.name || 'Extérieur')}</button></div>`
      : '';
    const seen = new Map();
    byTeam.forEach((s) => { if (s.player && s.player.id) seen.set(s.player.id, `${s.player.number != null ? '#' + s.player.number + ' ' : ''}${s.player.full_name || ''}`.trim()); });
    const playerChips = seen.size > 1
      ? `<div class="segmented sc-seg" data-kind="player"><button class="seg ${state.player === ALLV ? 'active' : ''}" data-v="${ALLV}">Tous</button>${[...seen.entries()].map(([id, l]) => `<button class="seg ${state.player === id ? 'active' : ''}" data-v="${id}">${esc(l)}</button>`).join('')}</div>`
      : '';
    const dots = shown.map((s) => `<span class="shot-dot ${s.made ? 'made' : 'miss'}" style="left:${Number(s.x)}%;top:${Number(s.y)}%"></span>`).join('');
    const made = shown.filter((s) => s.made).length;
    const pct = shown.length ? Math.round((made / shown.length) * 100) : 0;
    const zones = shotZoneSummary(shown).filter((z) => z.att > 0);
    const zoneHtml = zones.length ? `<div class="sc-zones">${zones.map((z) => `<div class="zone-row"><span class="zone-lbl">${esc(z.label)}</span><span class="zone-bar"><span class="zone-fill" style="width:${z.pct}%;background:${pctColor(z.pct)}"></span></span><span class="zone-pct">${z.pct}%</span><span class="zone-att">${z.made}/${z.att}</span></div>`).join('')}</div>` : '';
    slot.innerHTML = `<div class="block"><div class="block-head"><h2>Carte des tirs</h2></div>${teamChips}${playerChips}<div class="court-wrap">${court}<div class="court-dots">${dots}</div></div><div class="sc-legend"><span class="sc-key"><span class="sc-dot made"></span>Réussi</span><span class="sc-key"><span class="sc-dot miss"></span>Manqué</span><span class="sc-total">${made}/${shown.length} · ${pct}%</span></div>${zoneHtml}</div>`;
    slot.querySelectorAll('.sc-seg').forEach((seg) => {
      const kind = seg.dataset.kind;
      seg.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => {
        if (kind === 'team') { state.team = btn.dataset.v; state.player = ALLV; } else { state.player = btn.dataset.v; }
        paint();
      }));
    });
  }
  paint();
}

// =========================================================================
// INSCRIPTION DES CLUBS — un dirigeant dépose une demande d'engagement en
// compétition (formulaire public, connexion requise). La fédération l'examine
// depuis l'espace admin (« Inscriptions ») : approuver crée l'équipe. Garde-fous
// dans la base (RLS : insert = sa propre demande, lecture = la sienne ou admin).
// =========================================================================
const REGISTRATION_SELECT = '*, competition:competitions(*)';
const REG_CATS = [['messieurs', 'Messieurs'], ['dames', 'Dames'], ['u18', 'U18'], ['autre', 'Autre']];
const REG_STATUS = { pending: { label: 'En attente', cls: 'pend' }, approved: { label: 'Approuvée', cls: 'ok' }, rejected: { label: 'Rejetée', cls: 'bad' } };
function catLabelWeb(c) { return ({ messieurs: 'Messieurs', dames: 'Dames', u18: 'U18', autre: 'Autre' })[c] || c; }

async function getCurrentSeason() {
  const { data } = await sb.from('seasons').select('*').eq('is_current', true).maybeSingle();
  return data ?? null;
}
async function listMyRegistrations() {
  const uid = session?.user?.id;
  if (!uid) return [];
  const { data, error } = await sb.from('club_registrations').select(REGISTRATION_SELECT).eq('user_id', uid).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function submitRegistration(input) {
  const uid = session?.user?.id;
  if (!uid) throw new Error('Connectez-vous pour envoyer une demande.');
  const { error } = await sb.from('club_registrations').insert({ ...input, user_id: uid });
  if (error) throw error;
}
async function listRegistrations(status) {
  let q = sb.from('club_registrations').select(REGISTRATION_SELECT).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
// Sigle proposé pour le club créé : initiales des mots, sinon le début du nom.
function regShortName(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  const ini = words.map((w) => w[0]).join('').toUpperCase();
  return (ini.length >= 2 ? ini : (name || '').trim().toUpperCase()).slice(0, 4);
}
async function approveRegistration(id) {
  const { data, error: readErr } = await sb.from('club_registrations').select('*').eq('id', id).single();
  if (readErr) throw readErr;
  const reg = data;
  // Une demande déjà rattachée à une équipe ne doit pas en recréer une (double clic).
  let teamId = reg.team_id;
  if (!teamId) {
    const { data: team, error: teamErr } = await sb.from('teams').insert({ name: reg.club_name, short_name: regShortName(reg.club_name), city: reg.city, logo_url: reg.logo_url }).select('id').single();
    if (teamErr) throw teamErr;
    teamId = team.id;
  }
  const { error } = await sb.from('club_registrations').update({ status: 'approved', team_id: teamId, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return teamId;
}
async function rejectRegistration(id) {
  const { error } = await sb.from('club_registrations').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

function regMineCardHtml(r) {
  const s = REG_STATUS[r.status] || { label: r.status, cls: 'mut' };
  const meta = [r.city, catLabelWeb(r.category), r.competition?.name].filter(Boolean).join(' · ');
  const ava = r.logo_url ? `<span class="lic-ava"><img src="${esc(r.logo_url)}" alt=""></span>` : `<span class="lic-ava">${esc(initials(r.club_name))}</span>`;
  return `<div class="lic-card"><div class="lic-row">${ava}<div class="lic-info"><b>${esc(r.club_name)}</b><span>${esc(meta)}</span></div><span class="status-pill ${s.cls}">${esc(s.label)}</span></div><div class="reg-date">${fmtFullDate(r.created_at)}</div></div>`;
}

let regCat = 'messieurs';
let regComp; // compétition visée (optionnelle)
async function renderInscriptionClub() {
  view.innerHTML = `<h1 class="view-title">Inscrire mon club</h1><p class="view-sub">Déposez une demande d'engagement en compétition.</p><div id="icBody">${loadingHtml()}</div>`;
  const b = $('#icBody'); if (!b) return;
  if (!session) {
    b.innerHTML = emptyHtml('Connexion requise', 'Connectez-vous avec le compte du club pour déposer une demande et suivre son avancement.', 'inbox') + `<div style="text-align:center;margin-top:14px"><button class="btn" id="icLogin">Se connecter</button></div>`;
    $('#icLogin')?.addEventListener('click', () => openAuth('login'));
    return;
  }
  regCat = 'messieurs'; regComp = undefined;
  const [comps, season, mine] = await Promise.all([safe(listCompetitions(), []), safe(getCurrentSeason(), null), safe(listMyRegistrations(), [])]);
  if ($('#icBody') !== b) return;
  const compSeg = comps.length
    ? `<div class="segmented" id="icComp">${comps.map((c) => `<button type="button" class="seg" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>`
    : `<p class="view-sub" style="font-size:12.5px;margin:0">Aucune compétition ouverte pour le moment.</p>`;
  const seasonLine = season ? `<p class="view-sub" style="font-size:11.5px;margin:6px 0 0">Saison ${esc(season.name)}</p>` : '';
  b.innerHTML = `
    <form class="admin-form" id="icForm" novalidate>
      <p class="view-sub" style="font-size:12.5px">Renseignez les informations de votre club. La fédération valide la demande, crée l'équipe et l'inscrit à la compétition choisie.</p>
      ${adminFieldHtml({ k: 'logo_url', type: 'image', folder: 'clubs', label: 'Logo du club' }, '')}
      ${adminFieldHtml({ k: 'club_name', type: 'text', label: 'Nom du club', required: true, placeholder: 'Ex. Étoile de Conakry' }, '')}
      ${adminFieldHtml({ k: 'city', type: 'text', label: 'Ville', placeholder: 'Conakry' }, '')}
      <div class="field"><label>Catégorie</label><div class="segmented" id="icCat">${REG_CATS.map(([id, l]) => `<button type="button" class="seg ${regCat === id ? 'active' : ''}" data-c="${id}">${l}</button>`).join('')}</div></div>
      <div class="field"><label>Compétition visée</label>${compSeg}${seasonLine}</div>
      <div class="block-head mc-sec"><h2>Personne à contacter</h2></div>
      ${adminFieldHtml({ k: 'contact_name', type: 'text', label: 'Nom du responsable', placeholder: 'Prénom et nom' }, profile?.full_name || '')}
      ${adminFieldHtml({ k: 'contact_phone', type: 'text', label: 'Téléphone', placeholder: '+224 6XX XX XX XX' }, '')}
      ${adminFieldHtml({ k: 'contact_email', type: 'text', label: 'E-mail', placeholder: 'club@exemple.gn' }, session.user.email || '')}
      ${adminFieldHtml({ k: 'note', type: 'textarea', label: 'Message', placeholder: 'Précisions utiles à la fédération', rows: 3 }, '')}
      <div class="form-actions"><button type="submit" class="btn">Envoyer la demande</button></div>
    </form>
    <div class="block-head mc-sec"><h2>Mes demandes</h2></div>
    <div id="icMine">${mine.length ? mine.map(regMineCardHtml).join('') : `<p class="view-sub" style="font-size:12.5px;margin:0">Vous n'avez pas encore déposé de demande.</p>`}</div>`;

  const form = $('#icForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  $('#icCat').querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => {
    regCat = btn.dataset.c;
    $('#icCat').querySelectorAll('.seg').forEach((x) => x.classList.toggle('active', x === btn));
  }));
  const compWrap = $('#icComp');
  if (compWrap) compWrap.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => {
    if (regComp === btn.dataset.c) { regComp = undefined; btn.classList.remove('active'); }
    else { regComp = btn.dataset.c; compWrap.querySelectorAll('.seg').forEach((x) => x.classList.toggle('active', x === btn)); }
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
    const clubName = g('club_name'), phone = g('contact_phone'), email = g('contact_email');
    if (!clubName) { toast('Le nom du club est obligatoire'); return; }
    if (!phone && !email) { toast('Indiquez au moins un téléphone ou un e-mail'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Envoi…';
    try {
      await submitRegistration({
        club_name: clubName, city: g('city') || null, category: regCat,
        contact_name: g('contact_name') || null, contact_phone: phone || null, contact_email: email || null,
        competition_id: regComp || null, season_id: season?.id || null,
        logo_url: form.querySelector('[name="logo_url"]')?.value || null, note: g('note') || null,
      });
      toast('Demande envoyée. La fédération vous répondra prochainement.');
      renderInscriptionClub();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
}

// ----------------------------------------------------- revue admin des inscriptions
function regContactLine(icInner, text) {
  return text ? `<div class="reg-cline">${icoSvg(icInner)}<span>${esc(text)}</span></div>` : '';
}
function regAdminCardHtml(reg) {
  const s = REG_STATUS[reg.status] || { label: reg.status, cls: 'mut' };
  const meta = [reg.city, catLabelWeb(reg.category), reg.competition?.name].filter(Boolean).join(' · ');
  const ava = reg.logo_url ? `<span class="lic-ava"><img src="${esc(reg.logo_url)}" alt=""></span>` : `<span class="lic-ava">${esc(initials(reg.club_name))}</span>`;
  const contact = [
    regContactLine('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/>', reg.contact_name),
    regContactLine('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>', reg.contact_phone),
    regContactLine('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', reg.contact_email),
  ].join('') || '<div class="reg-cline mut">Aucun contact renseigné</div>';
  const actions = reg.status === 'pending'
    ? `<div class="reg-actions"><button class="reg-btn ok" data-approve="${reg.id}">✓ Approuver</button><button class="reg-btn bad" data-reject="${reg.id}">✕ Rejeter</button></div>`
    : '';
  return `<div class="reg-card">
    <div class="lic-row">${ava}<div class="lic-info"><b>${esc(reg.club_name)}</b><span>${esc(meta)}</span></div><span class="status-pill ${s.cls}">${esc(s.label)}</span></div>
    <div class="reg-contact"><div class="reg-clabel">Contact</div>${contact}${reg.note ? `<div class="reg-note">${esc(reg.note)}</div>` : ''}<div class="reg-date">${fmtFullDate(reg.created_at)}</div></div>
    ${actions}
  </div>`;
}
let regFilter = 'pending';
async function renderAdminRegistrations() {
  if (!isAdmin()) return renderAdminDenied();
  view.innerHTML = adminBackHtml() + `<h1 class="view-title">Inscriptions des clubs</h1><p class="view-sub">Examinez les demandes déposées par les clubs. Approuver crée l'équipe.</p><div id="regFilter"></div><div id="regBody">${loadingHtml()}</div>`;
  const f = $('#regFilter'); f.className = 'segmented';
  const filters = [['pending', 'En attente'], ['approved', 'Approuvées'], ['rejected', 'Rejetées'], ['all', 'Toutes']];
  f.innerHTML = filters.map(([id, l]) => `<button class="seg ${regFilter === id ? 'active' : ''}" data-f="${id}">${l}</button>`).join('');
  f.querySelectorAll('.seg').forEach((btn) => btn.addEventListener('click', () => { regFilter = btn.dataset.f; renderAdminRegistrations(); }));
  const rows = await safe(listRegistrations(regFilter === 'all' ? undefined : regFilter), null);
  const b = $('#regBody'); if (!b) return;
  if (rows === null) { b.innerHTML = errorHtml(); return; }
  if (!rows.length) { b.innerHTML = emptyHtml('Aucune demande', "Les demandes d'inscription déposées par les clubs apparaissent ici.", 'inbox'); return; }
  b.innerHTML = rows.map(regAdminCardHtml).join('');
  b.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', async () => {
    const reg = rows.find((x) => x.id === btn.dataset.approve); if (!reg) return;
    if (!window.confirm(`Approuver l'inscription de « ${reg.club_name} » ?\nLe club sera créé dans la liste des équipes de la fédération.`)) return;
    btn.disabled = true;
    try { await approveRegistration(reg.id); teamsPromise = null; toast(`${reg.club_name} inscrit et ajouté aux équipes`); renderAdminRegistrations(); }
    catch (e) { toast(errMsg(e)); btn.disabled = false; }
  }));
  b.querySelectorAll('[data-reject]').forEach((btn) => btn.addEventListener('click', async () => {
    const reg = rows.find((x) => x.id === btn.dataset.reject); if (!reg) return;
    if (!window.confirm(`Rejeter l'inscription de « ${reg.club_name} » ?`)) return;
    btn.disabled = true;
    try { await rejectRegistration(reg.id); toast('Demande rejetée'); renderAdminRegistrations(); }
    catch (e) { toast(errMsg(e)); btn.disabled = false; }
  }));
}

// =========================================================================
// VAGUE 1 — Engagement du club : classement des supporters du club, sondages
// du club, sponsors du club, palmarès & records du club. Réutilise au maximum
// l'existant ; côté base : colonne polls.team_id + table club_sponsors (RLS
// bornées par manages_team). La confidentialité du classement est gérée par la
// fonction fan_leaderboard_by_team (n'expose que les supporters opt-in).
// =========================================================================
function externalUrlWeb(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : 'https://' + v;
}

// -- données
async function fanLeaderboardByTeam(teamId, limit = 20) {
  const { data, error } = await sb.rpc('fan_leaderboard_by_team', { p_team_id: teamId, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
async function listTeamAwards(teamId) {
  const { data, error } = await sb.from('awards').select('*, player:players(id, full_name)').eq('team_id', teamId).order('awarded_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function listTeamGameHighs(teamId) {
  const { data, error } = await sb.from('game_highs').select('*').eq('team_id', teamId).limit(500);
  if (error) throw error;
  return data ?? [];
}
function teamRecordsFrom(rows) {
  // meilleure performance du club pour chaque catégorie de records
  return RECORD_COLS.map((c) => {
    const best = rows.filter((r) => Number(r[c.key]) > 0).sort((a, b) => Number(b[c.key]) - Number(a[c.key]))[0];
    return best ? { key: c.key, label: c.label, unit: c.unit, ic: c.ic, row: best } : null;
  }).filter(Boolean);
}
async function listClubPolls(teamId) { // gestion : tous les sondages du club
  const { data, error } = await sb.from('polls').select('*').eq('team_id', teamId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function listActiveTeamPolls(teamId) { // affichage public : sondages actifs
  const { data, error } = await sb.from('polls').select('*').eq('team_id', teamId).eq('is_active', true).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function createClubPoll(teamId, question, options) {
  const { error } = await sb.from('polls').insert({ team_id: teamId, question: question.trim(), options, is_active: true });
  if (error) throw error;
}
async function setPollActive(id, active) {
  const { error } = await sb.from('polls').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}
async function deletePoll(id) {
  const { error } = await sb.from('polls').delete().eq('id', id);
  if (error) throw error;
}
async function listClubSponsors(teamId) {
  const { data, error } = await sb.from('club_sponsors').select('*').eq('team_id', teamId).order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function createClubSponsor(teamId, patch) {
  const { error } = await sb.from('club_sponsors').insert({ team_id: teamId, ...patch });
  if (error) throw error;
}
async function deleteClubSponsor(id) {
  const { error } = await sb.from('club_sponsors').delete().eq('id', id);
  if (error) throw error;
}

// -- blocs publics (fiche équipe)
function teamSupportersHtml(rows) {
  if (!rows.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco('<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 14.2c2.8.3 5 2.7 5 5.8"/>')}Classement des supporters</h2></div><div class="roster">${rows.map((r) => `<div class="roster-row${r.is_me ? ' me' : ''}"><span class="lrank" style="width:28px">${r.position_no}</span><span class="rr-name">${esc(r.name)}${r.is_me ? ' <b style="color:var(--accent)">(vous)</b>' : ''}</span><span class="rr-pos"><b style="color:var(--accent)">${r.points}</b> pts</span></div>`).join('')}</div></div>`;
}
function teamPalmaresHtml(awards) {
  if (!awards.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>')}Palmarès</h2></div><div class="roster">${awards.map((a) => `<div class="roster-row"><span class="award-ic">${icoSvg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>')}</span><span class="rr-name"><b>${esc(AWARD_LABELS[a.kind] || 'Distinction')}</b>${a.player ? ' — ' + esc(a.player.full_name) : a.label ? ' — ' + esc(a.label) : ''}${a.note ? `<span style="display:block;color:var(--dim);font-size:12.5px">${esc(a.note)}</span>` : ''}</span><span class="rr-pos">${a.awarded_at ? fmtDate(a.awarded_at) : ''}</span></div>`).join('')}</div></div>`;
}
function teamRecordsHtml(highs) {
  const recs = teamRecordsFrom(highs);
  if (!recs.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco('<path d="M13 2L4 14h7l-1 8 10-12h-7l1-8z"/>')}Records du club</h2></div><div class="rec-grid">${recs.map((c) => `<a class="rec-mini" href="#player/${c.row.player_id}"><span class="rec-mini-ic">${icoSvg(c.ic)}</span><span class="rec-mini-val">${c.row[c.key]}<small>${esc(c.unit)}</small></span><span class="rec-mini-lbl">${esc(c.label)}</span><span class="rec-mini-who">${esc(c.row.full_name)}</span></a>`).join('')}</div></div>`;
}
function teamSponsorsHtml(sponsors) {
  if (!sponsors.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco(CLUB_NAV_ICONS.sponsor)}Partenaires du club</h2></div><div class="club-sponsors">${sponsors.map((s) => {
    const inner = s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.name)}" loading="lazy">` : `<span class="cs-name">${esc(s.name)}</span>`;
    const url = externalUrlWeb(s.url);
    return url ? `<a class="cs-item" href="${esc(url)}" target="_blank" rel="noopener nofollow">${inner}</a>` : `<span class="cs-item">${inner}</span>`;
  }).join('')}</div></div>`;
}

// -- sous-écran : sondages du club (gestion)
async function renderClubPolls() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Sondages du club</h1><p class="view-sub">Posez des questions à vos abonnés. Les sondages actifs s'affichent sur votre page.</p><div id="cpBody">${loadingHtml()}</div>`;
  const b = $('#cpBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const polls = await safe(listClubPolls(club.id), []);
  b.innerHTML = `
    <form class="admin-form" id="cpollForm" novalidate>
      <div class="field"><label>Question</label><input type="text" name="question" placeholder="Qui sera l'homme du match ?" autocomplete="off"></div>
      <div class="field"><label>Options de réponse</label><textarea name="options" rows="4" placeholder="Une réponse par ligne"></textarea><span class="field-hint">Une réponse par ligne (2 minimum).</span></div>
      <div class="form-actions"><button type="submit" class="btn">Créer le sondage</button></div>
    </form>
    <div class="block-head mc-sec"><h2>Mes sondages (${polls.length})</h2></div>
    <div id="cpollList">${polls.length ? loadingHtml() : `<p class="view-sub" style="font-size:12.5px;margin:0">Aucun sondage pour le moment.</p>`}</div>`;
  $('#cpollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = e.target.querySelector('[name=question]').value.trim();
    const opts = e.target.querySelector('[name=options]').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!q) { toast('Écrivez une question'); return; }
    if (opts.length < 2) { toast('Ajoutez au moins 2 réponses'); return; }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; const o = btn.textContent; btn.textContent = 'Création…';
    try { await createClubPoll(club.id, q, opts); toast('Sondage créé'); renderClubPolls(); }
    catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = o; }
  });
  if (polls.length) {
    const listEl = $('#cpollList');
    const cards = await Promise.all(polls.map((p) => clubPollAdminCard(p)));
    if ($('#cpollList') !== listEl) return;
    listEl.innerHTML = '';
    cards.forEach((c) => listEl.appendChild(c));
  }
}
async function clubPollAdminCard(p) {
  const results = await safe(pollResults(p.id), []);
  const total = results.reduce((s, r) => s + Number(r.votes || 0), 0);
  const opts = (p.options || []).map((opt, i) => {
    const votes = Number(results.find((r) => r.option_index === i)?.votes || 0);
    const pct = total ? Math.round((votes / total) * 100) : 0;
    return `<div class="poll-res"><span class="pr-fill" style="width:${pct}%"></span><span class="pr-label">${esc(opt)}</span><span class="pr-pct">${pct}% · ${votes}</span></div>`;
  }).join('');
  const wrap = document.createElement('div');
  wrap.className = 'poll';
  wrap.innerHTML = `<div class="cpoll-head"><h3>${esc(p.question)}</h3><span class="status-pill ${p.is_active ? 'ok' : 'mut'}">${p.is_active ? 'Actif' : 'Masqué'}</span></div><div class="poll-res-list">${opts}</div><div class="poll-foot">${total} vote${total > 1 ? 's' : ''}</div><div class="reg-actions"><button class="reg-btn ok" data-toggle="${p.id}">${p.is_active ? 'Masquer' : 'Activer'}</button><button class="reg-btn bad" data-del="${p.id}">Supprimer</button></div>`;
  wrap.querySelector('[data-toggle]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { await setPollActive(p.id, !p.is_active); toast(p.is_active ? 'Sondage masqué' : 'Sondage activé'); renderClubPolls(); }
    catch (err) { toast(errMsg(err)); e.currentTarget.disabled = false; }
  });
  wrap.querySelector('[data-del]').addEventListener('click', async () => {
    if (!window.confirm('Supprimer ce sondage ?\nCette action est définitive.')) return;
    try { await deletePoll(p.id); toast('Sondage supprimé'); renderClubPolls(); }
    catch (err) { toast(errMsg(err)); }
  });
  return wrap;
}

// -- sous-écran : sponsors du club (gestion)
async function renderClubSponsors() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Sponsors du club</h1><p class="view-sub">Vos partenaires, affichés sur la page publique de votre club.</p><div id="csBody">${loadingHtml()}</div>`;
  const b = $('#csBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const sponsors = await safe(listClubSponsors(club.id), []);
  b.innerHTML = `
    <form class="admin-form" id="csForm" novalidate>
      ${adminFieldHtml({ k: 'name', type: 'text', label: 'Nom du partenaire', required: true, placeholder: 'Ex. Orange Guinée' }, '')}
      ${adminFieldHtml({ k: 'logo_url', type: 'image', folder: 'sponsors', label: 'Logo' }, '')}
      ${adminFieldHtml({ k: 'url', type: 'text', label: 'Site web', placeholder: 'https://…' }, '')}
      <div class="form-actions"><button type="submit" class="btn">Ajouter</button></div>
    </form>
    <div class="block-head mc-sec"><h2>Mes partenaires (${sponsors.length})</h2></div>
    <div id="csList">${sponsors.length ? `<div class="roster">${sponsors.map((s) => `<div class="roster-row">${s.logo_url ? `<span class="mlogo sm"><img src="${esc(s.logo_url)}" alt=""></span>` : `<span class="mlogo sm">${esc(initials(s.name))}</span>`}<span class="rr-name">${esc(s.name)}${s.url ? `<span style="display:block;color:var(--dim);font-size:12px">${esc(s.url)}</span>` : ''}</span><span class="rr-actions"><button class="mini-del" data-del="${s.id}" aria-label="Retirer">✕</button></span></div>`).join('')}</div>` : `<p class="view-sub" style="font-size:12.5px;margin:0">Aucun partenaire pour le moment.</p>`}</div>`;
  const form = $('#csForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.querySelector('[name=name]').value.trim();
    if (!name) { toast('Le nom du partenaire est obligatoire'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const o = btn.textContent; btn.textContent = 'Ajout…';
    try {
      await createClubSponsor(club.id, { name, logo_url: form.querySelector('[name=logo_url]').value || null, url: form.querySelector('[name=url]').value.trim() || null });
      toast('Partenaire ajouté'); renderClubSponsors();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = o; }
  });
  b.querySelectorAll('#csList [data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!window.confirm('Retirer ce partenaire ?')) return;
    try { await deleteClubSponsor(btn.dataset.del); toast('Partenaire retiré'); renderClubSponsors(); } catch (e) { toast(errMsg(e)); }
  }));
}

// =========================================================================
// VAGUE 2 — Visibilité & partage : vitrine du club (présentation + galerie
// photos) et cartes de partage (image générée côté client + partage natif).
// Côté base : colonne teams.presentation + photos.team_id (RLS manages_team).
// Les cartes ne touchent AUCUNE donnée serveur : Canvas + navigator.share.
// =========================================================================
const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

// -- données : galerie photos du club (réutilise la table photos via team_id)
async function listTeamPhotos(teamId) {
  const { data, error } = await sb.from('photos').select('*').eq('team_id', teamId).order('position', { ascending: true }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function addTeamPhoto(teamId, patch) {
  const { error } = await sb.from('photos').insert({ team_id: teamId, ...patch });
  if (error) throw error;
}
async function deleteTeamPhoto(id) {
  const { error } = await sb.from('photos').delete().eq('id', id);
  if (error) throw error;
}

// -- bloc public : galerie (fiche équipe) ; câblage lightbox fait par renderTeam
function teamGalleryHtml(photos) {
  if (!photos.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco(CLUB_NAV_ICONS.gallery)}Galerie</h2></div><div class="photo-grid" id="teamGallery">${photos.map((p, i) => `<button class="photo-thumb" data-i="${i}"><img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy"></button>`).join('')}</div></div>`;
}

// -- sous-écran « Mon club » : gestion de la galerie
async function renderClubGallery() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Galerie photos</h1><p class="view-sub">Vos photos s'affichent dans la vitrine publique de votre club.</p><div id="cgBody">${loadingHtml()}</div>`;
  const b = $('#cgBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const photos = await safe(listTeamPhotos(club.id), []);
  b.innerHTML = `
    <form class="admin-form" id="cgForm" novalidate>
      ${adminFieldHtml({ k: 'url', type: 'image', folder: 'teams', label: 'Photo' }, '')}
      ${adminFieldHtml({ k: 'caption', type: 'text', label: 'Légende (optionnel)', placeholder: 'Ex. Finale de la coupe 2024' }, '')}
      <div class="form-actions"><button type="submit" class="btn">Ajouter à la galerie</button></div>
    </form>
    <div class="block-head mc-sec"><h2>Mes photos (${photos.length})</h2></div>
    <div id="cgList">${photos.length ? `<div class="photo-grid">${photos.map((p) => `<div class="cg-cell"><img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy"><button class="cg-del" data-del="${p.id}" aria-label="Retirer">✕</button></div>`).join('')}</div>` : `<p class="view-sub" style="font-size:12.5px;margin:0">Aucune photo pour le moment.</p>`}</div>`;
  const form = $('#cgForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = form.querySelector('[name=url]').value;
    if (!url) { toast('Choisissez une image'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const o = btn.textContent; btn.textContent = 'Ajout…';
    try {
      await addTeamPhoto(club.id, { url, caption: form.querySelector('[name=caption]').value.trim() || null });
      toast('Photo ajoutée'); renderClubGallery();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = o; }
  });
  b.querySelectorAll('#cgList [data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!window.confirm('Retirer cette photo ?')) return;
    try { await deleteTeamPhoto(btn.dataset.del); toast('Photo retirée'); renderClubGallery(); } catch (e) { toast(errMsg(e)); }
  }));
}

// -- cartes de partage : dessin d'une image 1080×1080 puis partage/téléchargement
const SHARE_SIZE = 1080;
function shareTeamColor(hex) {
  const v = (hex || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#3BD61B';
}
function slugForFile(s) {
  return (String(s || 'club').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)) || 'club';
}
function loadShareImage(url) {
  // charge en CORS ; si le serveur ne renvoie pas d'en-tête CORS, onerror se
  // déclenche et la carte se dessine sans logo (canvas jamais « tainted »).
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image(); img.crossOrigin = 'anonymous';
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    img.onload = () => finish(img); img.onerror = () => finish(null);
    setTimeout(() => finish(null), 4000);
    img.src = url;
  });
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitLine(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur); cur = w;
      if (lines.length === maxLines) { cur = ''; break; }
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // ellipse si le texte déborde du nombre de lignes autorisé
  const shown = lines.join(' ').split(' ').filter(Boolean).length;
  if (shown < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}
async function drawShareCard(spec) {
  const S = SHARE_SIZE, pad = 84;
  const cvs = document.createElement('canvas'); cvs.width = S; cvs.height = S;
  const ctx = cvs.getContext('2d');
  const accent = shareTeamColor(spec.accent);
  ctx.fillStyle = '#071E1B'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, S, 14);

  // en-tête fédération
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = accent; ctx.font = '800 44px system-ui, "Segoe UI", sans-serif';
  ctx.fillText('FGBB', pad, 132);
  ctx.fillStyle = '#8FB0A6'; ctx.font = '500 26px system-ui, "Segoe UI", sans-serif';
  ctx.fillText('Fédération Guinéenne de Basket-Ball', pad, 170);

  // badge / logo (haut-droite)
  const bs = 132, bx = S - pad - bs, by = 66;
  const logo = await loadShareImage(spec.logoUrl);
  ctx.save(); roundRectPath(ctx, bx, by, bs, bs, 30); ctx.clip();
  ctx.fillStyle = accent; ctx.fillRect(bx, by, bs, bs);
  if (logo) ctx.drawImage(logo, bx, by, bs, bs);
  else if (spec.badgeText) { ctx.fillStyle = '#06201C'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 52px system-ui, sans-serif'; ctx.fillText(spec.badgeText, bx + bs / 2, by + bs / 2 + 2); }
  else { // ballon de basket stylisé (carte fédération sans logo)
    const cx = bx + bs / 2, cy = by + bs / 2, rr = bs * 0.30;
    ctx.strokeStyle = '#06201C'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - rr, cy); ctx.lineTo(cx + rr, cy); ctx.moveTo(cx, cy - rr); ctx.lineTo(cx, cy + rr); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - rr, cy, rr, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + rr, cy, rr, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // étiquette de type
  ctx.fillStyle = accent; ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText(String(spec.badge || '').toUpperCase(), pad, 296);

  if (spec.score) {
    const s = spec.score;
    if (spec.meta) { ctx.fillStyle = '#8FB0A6'; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(fitLine(ctx, spec.meta, S - pad * 2), pad, 352); }
    const hw = Number(s.home) > Number(s.away), aw = Number(s.away) > Number(s.home);
    const rows = [{ name: s.homeName, sc: s.home, win: hw }, { name: s.awayName, sc: s.away, win: aw }];
    let y = 540;
    for (const r of rows) {
      ctx.textAlign = 'right'; ctx.font = '800 132px system-ui, sans-serif'; ctx.fillStyle = r.win ? accent : '#EAF3EE';
      ctx.fillText(String(r.sc), S - pad, y);
      ctx.textAlign = 'left'; ctx.font = '700 54px system-ui, sans-serif'; ctx.fillStyle = r.win ? '#EAF3EE' : '#9FB8AE';
      ctx.fillText(fitLine(ctx, r.name, S - pad * 2 - 230), pad, y - 34);
      y += 196;
    }
  } else {
    ctx.fillStyle = '#EAF3EE'; ctx.font = '800 60px system-ui, sans-serif';
    let y = 384;
    for (const ln of wrapLines(ctx, spec.title, S - pad * 2, 2)) { ctx.fillText(ln, pad, y); y += 74; }
    if (spec.subtitle) { ctx.fillStyle = '#8FB0A6'; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(fitLine(ctx, spec.subtitle, S - pad * 2), pad, y + 4); y += 60; }
    if (spec.body) {
      ctx.fillStyle = '#CFE0D8'; ctx.font = '500 42px system-ui, sans-serif';
      y += 26;
      for (const ln of wrapLines(ctx, spec.body, S - pad * 2, spec.bodyMax || 6)) { ctx.fillText(ln, pad, y); y += 60; }
    }
    if (spec.stat) {
      ctx.fillStyle = '#8FB0A6'; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText(spec.statLabel || '', pad, S - 196);
      ctx.fillStyle = accent; ctx.font = '800 48px system-ui, sans-serif'; ctx.fillText(spec.stat, pad, S - 148);
    }
  }
  // pied
  ctx.textAlign = 'left'; ctx.fillStyle = accent; ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText('fgbb.ink', pad, S - 64);
  return cvs;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function shareCanvas(cvs, filename, text) {
  let blob; try { blob = await new Promise((res) => cvs.toBlob(res, 'image/png')); } catch { blob = null; }
  if (!blob) { toast('Génération impossible'); return; }
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); } catch {} // annulé par l'utilisateur : rien à faire
    return;
  }
  downloadBlob(blob, filename);
  toast('Image téléchargée — partagez-la sur WhatsApp ou Facebook');
}
async function openShareCard(spec) {
  let ov = document.getElementById('shareModal');
  if (!ov) { ov = document.createElement('div'); ov.id = 'shareModal'; ov.className = 'share-modal'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="share-box"><button class="share-x" aria-label="Fermer">✕</button><div class="share-prev">${loadingHtml()}</div><div class="share-actions"><button class="btn" id="shDo">${SHARE_ICON}Partager</button><button class="btn btn-ghost" id="shDl">Télécharger</button></div></div>`;
  ov.classList.add('open');
  const close = () => ov.classList.remove('open');
  ov.onclick = (e) => { if (e.target === ov) close(); };
  ov.querySelector('.share-x').onclick = close;
  let cvs;
  try { cvs = await drawShareCard(spec); } catch { ov.querySelector('.share-prev').innerHTML = '<p class="view-sub" style="padding:20px">Aperçu indisponible.</p>'; return; }
  if (!ov.classList.contains('open')) return; // fermé pendant le dessin
  let dataUrl = ''; try { dataUrl = cvs.toDataURL('image/png'); } catch {}
  ov.querySelector('.share-prev').innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Aperçu de la carte de partage">` : '<p class="view-sub" style="padding:20px">Aperçu indisponible.</p>';
  $('#shDo').onclick = () => shareCanvas(cvs, spec.filename, spec.shareText);
  $('#shDl').onclick = () => cvs.toBlob((b) => { if (b) downloadBlob(b, spec.filename); else toast('Génération impossible'); }, 'image/png');
}

// -- constructeurs de « spec » de carte
function teamShareSpec(t, standing) {
  const rec = standing ? `${standing.wins} V · ${standing.losses} D · ${standing.points} pts` : null;
  return {
    badge: 'Le club', title: t.name, accent: t.color, logoUrl: t.logo_url, badgeText: initials(t.short_name || t.name),
    subtitle: [labelOf(TEAM_GENDERS, t.gender), t.city, t.founded_year ? 'depuis ' + t.founded_year : null].filter(Boolean).join(' · '),
    body: t.presentation || 'Suivez toute l\'actualité du club sur FGBB.', bodyMax: rec ? 4 : 6,
    stat: rec, statLabel: rec ? 'Bilan en championnat' : '',
    filename: `fgbb-${slugForFile(t.name)}.png`, shareText: `${t.name} — sur FGBB · https://fgbb.ink`,
  };
}
function postShareSpec(t, p) {
  return {
    badge: 'Actu du club', title: t.name, accent: t.color, logoUrl: t.logo_url, badgeText: initials(t.short_name || t.name),
    subtitle: fmtFullDate(p.created_at), body: p.body || '', bodyMax: 7,
    filename: `fgbb-actu-${slugForFile(t.name)}.png`,
    shareText: `${t.name} — ${String(p.body || '').replace(/\s+/g, ' ').slice(0, 140)} · https://fgbb.ink`,
  };
}
function matchShareSpec(m) {
  return {
    badge: m.status === 'live' ? 'Score en direct' : 'Résultat', accent: '#3BD61B', logoUrl: null,
    meta: [m.competition?.name, fmtDate(m.scheduled_at)].filter(Boolean).join(' · '),
    score: { home: m.home_score ?? 0, away: m.away_score ?? 0, homeName: m.home_team?.name || 'Domicile', awayName: m.away_team?.name || 'Extérieur' },
    filename: 'fgbb-resultat.png',
    shareText: `${m.home_team?.name || ''} ${m.home_score ?? 0}–${m.away_score ?? 0} ${m.away_team?.name || ''} · https://fgbb.ink`,
  };
}

// =========================================================================
// Feature 07 — Notifications aux abonnés (Web Push / VAPID). Canal WEB, distinct
// du canal mobile (Expo). L'utilisateur active les notifications sur sa page
// « Favoris » ; il est alors prévenu quand un club qu'il suit publie. Envoi via
// l'Edge Function send-web-push. Table push_subscriptions (un abonnement par
// navigateur/appareil). iOS : nécessite l'app installée à l'écran d'accueil.
// =========================================================================
const VAPID_PUBLIC_KEY = 'BLfbJXY3ggd3odP-Sig41fJfXWiGwtfpMtP70_LfqDB-PHiNy4svyZG28kuOUWZdGmRbOj_Bjx-XhhbNwc-5aeU';
const BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>';

function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
let swRegPromise = null;
function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!swRegPromise) swRegPromise = navigator.serviceWorker.register('/sw.js').catch(() => null);
  return swRegPromise;
}
async function isPushEnabled() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch { return false; }
}
async function enablePush() {
  if (!pushSupported()) { toast('Notifications non disponibles sur cet appareil'); return false; }
  const uid = session?.user?.id;
  if (!uid) { openAuth('login'); return false; }
  let perm;
  try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
  if (perm !== 'granted') { toast(perm === 'denied' ? 'Notifications bloquées dans le navigateur' : 'Notifications non activées'); return false; }
  const reg = await ensureServiceWorker();
  if (!reg) { toast('Service worker indisponible'); return false; }
  try { await navigator.serviceWorker.ready; } catch {}
  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  } catch { toast('Abonnement impossible'); return false; }
  const j = sub.toJSON();
  try {
    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      user_agent: navigator.userAgent, updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
  } catch (e) { toast(errMsg(e)); return false; }
  toast('Notifications activées');
  return true;
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      const ep = sub.endpoint;
      try { await sub.unsubscribe(); } catch {}
      await safe(sb.from('push_subscriptions').delete().eq('endpoint', ep), null);
    }
  } catch {}
  toast('Notifications désactivées');
}
// Notifie les abonnés d'un club après une publication (best-effort, ne bloque pas
// l'UI). Canal WEB via send-web-push ; le canal mobile reste géré à part.
function notifyClubPost(club, bodyText) {
  const title = club.name;
  const body = String(bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const url = '/app#team/' + club.id;
  safe(sb.functions.invoke('send-web-push', { body: { team_id: club.id, title, body, url } }), null);
}
// Bandeau d'activation sur la page Favoris
function pushBannerHtml(enabled) {
  if (!pushSupported()) return '';
  return `<div class="push-banner" id="pushBanner">
    <span class="push-ic">${BELL_SVG}</span>
    <div class="push-txt"><b>Notifications des clubs suivis</b><span>${enabled ? 'Activées — vous serez prévenu à chaque publication.' : 'Soyez prévenu quand un club que vous suivez publie.'}</span></div>
    <button class="btn sm ${enabled ? 'btn-ghost' : ''}" id="pushToggle">${enabled ? 'Désactiver' : 'Activer'}</button>
  </div>`;
}
function wirePushBanner(enabled) {
  const btn = $('#pushToggle'); if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    if (enabled) await disablePush(); else await enablePush();
    btn.disabled = false;
    if (RENDERERS[currentRoute] === renderFavoris) renderFavoris();
  };
}

// =========================================================================
// VAGUE 3 — Outils du quotidien : convocations & disponibilités (table
// player_availability, dans la Feuille de match), scouting de l'adversaire
// (réutilise stats + carte des tirs, aucune donnée nouvelle) et impression
// de la feuille de match (génération côté client, fenêtre imprimable → PDF).
// =========================================================================
const AVAIL = [
  { v: 'available', label: 'Dispo', cls: 'ok' },
  { v: 'doubtful', label: 'Incertain', cls: 'warn' },
  { v: 'injured', label: 'Blessé', cls: 'bad' },
  { v: 'absent', label: 'Absent', cls: 'mut' },
];
function availMeta(v) { return AVAIL.find((a) => a.v === v) || AVAIL[0]; }

// -- données : disponibilités
async function getMatchAvailability(matchId, teamId) {
  const { data, error } = await sb.from('player_availability').select('player_id, status').eq('match_id', matchId).eq('team_id', teamId);
  if (error) throw error;
  return data ?? [];
}
async function setPlayerAvailability(matchId, teamId, playerId, status) {
  const { error } = await sb.from('player_availability').upsert(
    { match_id: matchId, team_id: teamId, player_id: playerId, status, updated_at: new Date().toISOString() },
    { onConflict: 'match_id,player_id' },
  );
  if (error) throw error;
}

// -- données : scouting (lecture publique)
async function listTeamShots(teamId) {
  const { data, error } = await sb.from('shots').select('*, player:players(id, full_name, number)').eq('team_id', teamId).order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return data ?? [];
}
async function getTeamTopScorers(teamId, n) {
  const { data, error } = await sb.from('player_season_stats').select('*').eq('team_id', teamId).order('ppg', { ascending: false }).limit(n);
  if (error) throw error;
  return data ?? [];
}
function teamFormFrom(matches, teamId) {
  return matches.filter((m) => m.status === 'finished').sort((a, b) => tOf(b.scheduled_at) - tOf(a.scheduled_at)).slice(0, 5).map((m) => {
    const isHome = m.home_team_id === teamId;
    const my = isHome ? m.home_score : m.away_score;
    const other = isHome ? m.away_score : m.home_score;
    const opp = isHome ? m.away_team : m.home_team;
    const res = my > other ? 'W' : my < other ? 'L' : 'N';
    return { res, my, other, opp, m };
  });
}

// -- scouting de l'adversaire
async function renderScouting(teamId) {
  view.innerHTML = backBtnHtml() + loadingHtml(); wireBack(); window.scrollTo({ top: 0 });
  const [t, matches, scorers, shots] = await Promise.all([
    safe(getTeam(teamId), null), safe(getTeamMatches(teamId), []), safe(getTeamTopScorers(teamId, 6), []), safe(listTeamShots(teamId), []),
  ]);
  if (!t) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  const form = teamFormFrom(matches, teamId);
  const scoutColor = t.color || '#0E5F58';
  let html = backBtnHtml();
  html += `<div class="profile">
    <div class="crest-badge" style="background:${esc(scoutColor)};box-shadow:0 0 0 4px ${hexA(scoutColor, 0.16)}">${t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : `<span>${esc(t.short_name || initials(t.name))}</span>`}</div>
    <div class="profile-info"><h1>${esc(t.name)}</h1><div class="profile-sub">Scouting · aperçu avant match</div></div>
  </div>`;
  // forme récente
  if (form.length) {
    html += `<div class="block"><div class="block-head"><h2>Forme récente</h2></div><div class="scout-form">${form.map((f) => `<span class="form-pill ${f.res}" title="${esc(f.opp?.name || '')} ${f.my}-${f.other}">${f.res === 'W' ? 'V' : f.res === 'L' ? 'D' : 'N'}</span>`).join('')}</div>
      <div class="roster" style="margin-top:10px">${form.map((f) => `<div class="roster-row"><span class="rr-name">${esc(f.opp?.name || 'Adversaire')}</span><span class="rr-pos"><b class="${f.res === 'W' ? 'win-txt' : f.res === 'L' ? 'loss-txt' : ''}">${f.my}–${f.other}</b> · ${fmtDate(f.m.scheduled_at)}</span></div>`).join('')}</div></div>`;
  }
  // meilleurs marqueurs
  const sc = scorers.filter((s) => Number(s.ppg) > 0);
  if (sc.length) {
    html += `<div class="block"><div class="block-head"><h2>Joueurs à surveiller</h2></div><div class="roster">${sc.map((s) => `<a class="roster-row" href="#player/${s.player_id}"><span class="rr-name">${esc(s.full_name || 'Joueur')}</span><span class="rr-pos"><b style="color:var(--accent)">${Number(s.ppg).toFixed(1)}</b> pts${s.rpg ? ' · ' + Number(s.rpg).toFixed(1) + ' reb' : ''}${s.apg ? ' · ' + Number(s.apg).toFixed(1) + ' pd' : ''}</span></a>`).join('')}</div></div>`;
  }
  html += `<div id="scoutShots"></div>`;
  if (!form.length && !sc.length && !shots.length) html += emptyHtml('Pas encore de données', 'Cet adversaire n\'a pas encore de match, de statistique ni de tir enregistré.', 'ball');
  view.innerHTML = html; wireBack();
  fillTeamShotChart(shots, '#scoutShots');
}
function fillTeamShotChart(shots, slotSel) {
  const slot = document.querySelector(slotSel); if (!slot) return;
  if (!shots.length) return;
  const ALLV = 'all';
  const state = { player: ALLV };
  const court = courtSvg();
  function paint() {
    const shown = state.player === ALLV ? shots : shots.filter((s) => s.player && s.player.id === state.player);
    const seen = new Map();
    shots.forEach((s) => { if (s.player && s.player.id) seen.set(s.player.id, `${s.player.number != null ? '#' + s.player.number + ' ' : ''}${s.player.full_name || ''}`.trim()); });
    const playerChips = seen.size > 1
      ? `<div class="segmented sc-seg" data-kind="player"><button class="seg ${state.player === ALLV ? 'active' : ''}" data-v="${ALLV}">Tous</button>${[...seen.entries()].map(([id, l]) => `<button class="seg ${state.player === id ? 'active' : ''}" data-v="${id}">${esc(l)}</button>`).join('')}</div>`
      : '';
    const dots = shown.map((s) => `<span class="shot-dot ${s.made ? 'made' : 'miss'}" style="left:${Number(s.x)}%;top:${Number(s.y)}%"></span>`).join('');
    const made = shown.filter((s) => s.made).length;
    const pct = shown.length ? Math.round((made / shown.length) * 100) : 0;
    const zones = shotZoneSummary(shown).filter((z) => z.att > 0);
    const zoneHtml = zones.length ? `<div class="sc-zones">${zones.map((z) => `<div class="zone-row"><span class="zone-lbl">${esc(z.label)}</span><span class="zone-bar"><span class="zone-fill" style="width:${z.pct}%;background:${pctColor(z.pct)}"></span></span><span class="zone-pct">${z.pct}%</span><span class="zone-att">${z.made}/${z.att}</span></div>`).join('')}</div>` : '';
    slot.innerHTML = `<div class="block"><div class="block-head"><h2>Carte des tirs</h2></div>${playerChips}<div class="court-wrap">${court}<div class="court-dots">${dots}</div></div><div class="sc-legend"><span class="sc-key"><span class="sc-dot made"></span>Réussi</span><span class="sc-key"><span class="sc-dot miss"></span>Manqué</span><span class="sc-total">${made}/${shown.length} · ${pct}%</span></div>${zoneHtml}</div>`;
    slot.querySelectorAll('.sc-seg .seg').forEach((btn) => btn.addEventListener('click', () => { state.player = btn.dataset.v; paint(); }));
  }
  paint();
}

// -- impression de la feuille de match (fenêtre autonome → « Enregistrer en PDF »)
function buildMatchSheetHtml(club, m, players, avail) {
  const opp = m.home_team_id === club.id ? m.away_team : m.home_team;
  const lieu = m.home_team_id === club.id ? 'Domicile' : 'Extérieur';
  const meta = [m.competition?.name, m.round ? 'Journée ' + m.round : null, fmtDate(m.scheduled_at), fmtTime(m.scheduled_at), m.venue].filter(Boolean).join(' · ');
  const rows = players.map((p, i) => {
    const st = availMeta(avail.get(p.id) || 'available');
    return `<tr><td class="c">${i + 1}</td><td class="c">${p.number != null ? esc(String(p.number)) : ''}</td><td>${esc(p.full_name)}</td><td>${esc(p.position || '')}</td><td>${esc(st.label)}</td></tr>`;
  }).join('');
  const blanks = Math.max(0, 12 - players.length);
  const empties = Array.from({ length: blanks }, (_, i) => `<tr><td class="c">${players.length + i + 1}</td><td></td><td></td><td></td><td></td></tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuille de match — ${esc(club.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 32px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0F7A3D; padding-bottom: 10px; margin-bottom: 6px; }
  .fed { font-size: 11px; color: #555; }
  .fed b { display: block; font-size: 18px; color: #0F7A3D; letter-spacing: .5px; }
  h1 { font-size: 17px; margin: 14px 0 2px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 7px 9px; text-align: left; }
  th { background: #eef3ee; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  td.c { text-align: center; width: 42px; }
  tr { page-break-inside: avoid; }
  .sign { display: flex; gap: 40px; margin-top: 40px; }
  .sign div { flex: 1; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; color: #555; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="head"><div class="fed"><b>FGBB</b>Fédération Guinéenne de Basket-Ball</div><div class="fed" style="text-align:right">Feuille de match<br>${esc(lieu)}</div></div>
  <h1>${esc(club.name)} <span style="color:#888;font-weight:400">contre</span> ${esc(opp?.name || 'Adversaire')}</h1>
  <div class="meta">${esc(meta)}</div>
  <table><thead><tr><th class="c">#</th><th class="c">N°</th><th>Joueur</th><th>Poste</th><th>Statut</th></tr></thead>
  <tbody>${rows}${empties}</tbody></table>
  <div class="sign"><div>Entraîneur — nom &amp; signature</div><div>Officiel de table — visa</div></div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };<\/script>
</body></html>`;
}
function printMatchSheet(club, m, players, avail) {
  if (!m) { toast('Sélectionnez un match'); return; }
  if (!players.length) { toast('Sélectionnez au moins un joueur'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('Autorisez les fenêtres pop-up pour imprimer'); return; }
  w.document.write(buildMatchSheetHtml(club, m, players, avail));
  w.document.close();
}

// =========================================================================
// VAGUE 3 (feature 11) — Événements du club + RSVP. Le club annonce des
// événements (match à domicile, portes ouvertes, détection…) ; les fans
// s'inscrivent gratuitement (« Je viens » / « Peut-être »). Décomptes publics
// via la fonction club_event_counts (agrégat, sans exposer les identités).
// =========================================================================
const EVENT_KINDS = [
  { v: 'home_game', label: 'Match à domicile', ic: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M9 5v15"/>' },
  { v: 'open_house', label: 'Portes ouvertes', ic: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>' },
  { v: 'tryout', label: 'Détection', ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>' },
  { v: 'other', label: 'Autre', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>' },
];
function eventKind(v) { return EVENT_KINDS.find((k) => k.v === v) || EVENT_KINDS[3]; }
function eventDateLabel(iso) { const d = fmtDate(iso), t = fmtTime(iso); return t ? d + ' · ' + t : d; }

// -- données : événements & inscriptions
async function listClubEvents(teamId, order) {
  const { data, error } = await sb.from('club_events').select('*').eq('team_id', teamId).order('starts_at', { ascending: order !== 'desc' });
  if (error) throw error;
  return data ?? [];
}
async function getEventCounts(teamId) {
  const { data, error } = await sb.rpc('club_event_counts', { p_team_id: teamId });
  if (error) throw error;
  const map = new Map();
  (data ?? []).forEach((r) => map.set(r.event_id, { going: Number(r.going || 0), maybe: Number(r.maybe || 0) }));
  return map;
}
async function listMyEventRsvps() {
  if (!session?.user?.id) return new Map();
  const { data } = await sb.from('club_event_rsvp').select('event_id, status'); // RLS : uniquement les miennes
  const map = new Map(); (data ?? []).forEach((r) => map.set(r.event_id, r.status)); return map;
}
async function setEventRsvp(eventId, status) {
  const uid = session?.user?.id; if (!uid) throw new Error('Connectez-vous');
  const { error } = await sb.from('club_event_rsvp').upsert({ event_id: eventId, user_id: uid, status }, { onConflict: 'event_id,user_id' });
  if (error) throw error;
}
async function removeEventRsvp(eventId) {
  const uid = session?.user?.id; if (!uid) return;
  const { error } = await sb.from('club_event_rsvp').delete().eq('event_id', eventId).eq('user_id', uid);
  if (error) throw error;
}
async function createClubEvent(teamId, patch) {
  const { error } = await sb.from('club_events').insert({ team_id: teamId, created_by: session?.user?.id, ...patch });
  if (error) throw error;
}
async function updateClubEvent(id, patch) {
  const { error } = await sb.from('club_events').update(patch).eq('id', id);
  if (error) throw error;
}
async function deleteClubEvent(id) {
  const { error } = await sb.from('club_events').delete().eq('id', id);
  if (error) throw error;
}

// -- bloc public (fiche équipe) : événements à venir + inscription
function teamEventsHtml(events, counts, mine) {
  if (!events.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco(CLUB_NAV_ICONS.calendar)}Événements à venir</h2></div><div class="ev-list">${events.map((e) => {
    const k = eventKind(e.kind);
    const c = counts.get(e.id) || { going: 0, maybe: 0 };
    const my = mine.get(e.id) || null;
    const countTxt = `${c.going} inscrit${c.going > 1 ? 's' : ''}${c.maybe ? ` · ${c.maybe} peut-être` : ''}`;
    return `<div class="ev-card"><div class="ev-main"><span class="ev-ic">${icoSvg(k.ic)}</span><div class="ev-body"><span class="ev-kind">${esc(k.label)}</span><b class="ev-title">${esc(e.title)}</b><span class="ev-when">${esc(eventDateLabel(e.starts_at))}${e.location ? ' · ' + esc(e.location) : ''}</span>${e.description ? `<span class="ev-desc">${esc(e.description)}</span>` : ''}</div></div><div class="ev-foot"><span class="ev-count">${countTxt}</span><div class="ev-rsvp"><button class="ev-btn${my === 'going' ? ' on' : ''}" data-rsvp="going" data-ev="${e.id}">Je viens</button><button class="ev-btn ghost${my === 'maybe' ? ' on' : ''}" data-rsvp="maybe" data-ev="${e.id}">Peut-être</button></div></div></div>`;
  }).join('')}</div></div>`;
}
function wireTeamEvents(teamId, mine) {
  view.querySelectorAll('[data-rsvp]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!session?.user?.id) return openAuth('login');
    const eventId = btn.dataset.ev, status = btn.dataset.rsvp;
    try {
      if (mine.get(eventId) === status) { await removeEventRsvp(eventId); toast('Inscription annulée'); }
      else { await setEventRsvp(eventId, status); toast(status === 'going' ? 'Vous êtes inscrit !' : 'Noté : peut-être'); }
      renderTeam(teamId);
    } catch (e) { toast(errMsg(e)); }
  }));
}

// -- sous-écran « Mon club » : gestion des événements
async function renderClubEvents() {
  view.innerHTML = clubBackHtml() + `<h1 class="view-title">Événements</h1><p class="view-sub">Annoncez vos rendez-vous ; les fans s'inscrivent gratuitement.</p><div id="evBody">${loadingHtml()}</div>`;
  const b = $('#evBody'); if (!b) return;
  const club = session ? await resolveMyClub() : null;
  if (!club) { b.innerHTML = clubGateHtml(); return; }
  const [events, counts] = await Promise.all([safe(listClubEvents(club.id), []), safe(getEventCounts(club.id), new Map())]);
  const now = Date.now();
  const rowsHtml = events.length
    ? events.map((e) => {
        const k = eventKind(e.kind), c = counts.get(e.id) || { going: 0, maybe: 0 };
        const past = tOf(e.starts_at) < now;
        return `<div class="ev-manage${past ? ' past' : ''}"><span class="ev-ic">${icoSvg(k.ic)}</span><div class="ev-body"><span class="ev-kind">${esc(k.label)}${past ? ' · passé' : ''}</span><b class="ev-title">${esc(e.title)}</b><span class="ev-when">${esc(eventDateLabel(e.starts_at))}${e.location ? ' · ' + esc(e.location) : ''}</span><span class="ev-count">${c.going} inscrit${c.going > 1 ? 's' : ''}${c.maybe ? ` · ${c.maybe} peut-être` : ''}</span></div><span class="rr-actions"><button class="mini-btn" data-edit="${e.id}" aria-label="Modifier">${icoSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>')}</button><button class="mini-del" data-del="${e.id}" aria-label="Supprimer">✕</button></span></div>`;
      }).join('')
    : `<p class="view-sub" style="font-size:12.5px;margin:0">Aucun événement pour le moment.</p>`;
  b.innerHTML = `<div class="form-actions" style="margin:0 0 14px"><button class="btn" id="evAdd">+ Nouvel événement</button></div><div class="ev-manage-list">${rowsHtml}</div>`;
  $('#evAdd').addEventListener('click', () => openClubEvent(club, null));
  b.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openClubEvent(club, events.find((x) => x.id === btn.dataset.edit))));
  b.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!window.confirm('Supprimer cet événement ?\nLes inscriptions seront perdues.')) return;
    try { await deleteClubEvent(btn.dataset.del); toast('Événement supprimé'); renderClubEvents(); } catch (e) { toast(errMsg(e)); }
  }));
}
function openClubEvent(club, ev) {
  const editing = !!ev;
  const fields = [
    { k: 'title', type: 'text', label: 'Titre', required: true, placeholder: 'Ex. FGBB — Portes ouvertes' },
    { k: 'kind', type: 'select', label: 'Type', options: EVENT_KINDS.map((x) => ({ value: x.v, label: x.label })), required: true, default: 'home_game' },
    { k: 'starts_at', type: 'datetime', label: 'Date & heure', required: true },
    { k: 'location', type: 'text', label: 'Lieu', placeholder: 'Ex. Palais des Sports de Conakry' },
    { k: 'description', type: 'textarea', rows: 4, label: 'Description (optionnel)', placeholder: 'Programme, infos pratiques…' },
    { k: 'cover_url', type: 'image', folder: 'events', label: 'Visuel (optionnel)' },
  ];
  view.innerHTML = `<a class="back-btn" id="evBack" role="button" tabindex="0">${icoSvg('<path d="M15 18l-6-6 6-6"/>')}Événements</a>
    <h1 class="view-title">${editing ? 'Modifier' : 'Nouvel'} · événement</h1>
    <form class="admin-form" id="evForm" novalidate>${fields.map((f) => adminFieldHtml(f, editing ? ev[f.k] : undefined)).join('')}
      <div class="form-actions"><button type="button" class="btn btn-ghost" id="evCancel">Annuler</button><button type="submit" class="btn">${editing ? 'Enregistrer' : 'Publier'}</button></div>
    </form>`;
  $('#evBack').addEventListener('click', renderClubEvents);
  $('#evBack').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderClubEvents(); } });
  $('#evCancel').addEventListener('click', renderClubEvents);
  const form = $('#evForm');
  form.querySelectorAll('.image-field').forEach(wireImageField);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = collectCrudForm(fields, form);
    if (!patch.title) { toast('Le titre est obligatoire'); return; }
    if (!patch.starts_at) { toast('La date est obligatoire'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const o = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
      const body = { title: patch.title, kind: patch.kind || 'other', starts_at: patch.starts_at, location: patch.location || null, description: patch.description || null, cover_url: patch.cover_url || null };
      if (editing) await updateClubEvent(ev.id, body); else await createClubEvent(club.id, body);
      toast(editing ? 'Événement modifié' : 'Événement publié');
      renderClubEvents();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = o; }
  });
}

// =========================================================================
// VAGUE 4 (feature 12) — Trophées & badges du club. Distinctions calculées
// automatiquement à partir des matchs et des statistiques (séries, forteresse
// à domicile, plus large victoire, meilleure attaque/défense du championnat).
// Aucune donnée nouvelle : tout est dérivé de l'existant (matches +
// team_season_stats). Les distinctions décernées par la fédération restent
// gérées via la table awards (bloc « Palmarès »).
// =========================================================================
async function listAllTeamStats() {
  const { data, error } = await sb.from('team_season_stats').select('team_id, competition_id, games, wins, losses, pts_for, pts_against, diff');
  if (error) throw error;
  return data ?? [];
}
function computeClubBadges(teamId, matches, allStats) {
  const B = {
    flame: '<path d="M12 2C9 6 8 9 12 13c4-4 3-7 0-11z"/><path d="M6.5 12.5a5.5 5.5 0 1011 0c0-2-1-3.6-2.2-4.6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    crown: '<path d="M3 7l4 4 5-6 5 6 4-4v11H3z"/>',
  };
  const badges = [];
  const finished = (matches || []).filter((m) => m.status === 'finished').sort((a, b) => tOf(a.scheduled_at) - tOf(b.scheduled_at));
  const results = finished.map((m) => {
    const home = m.home_team_id === teamId;
    const my = home ? m.home_score : m.away_score;
    const opp = home ? m.away_score : m.home_score;
    return { win: my > opp, margin: my - opp, home, oppTeam: home ? m.away_team : m.home_team };
  });
  // série en cours
  let cur = 0; for (let i = results.length - 1; i >= 0; i--) { if (results[i].win) cur++; else break; }
  if (cur >= 2) badges.push({ ic: B.flame, label: 'En feu', detail: `${cur} victoires de suite` });
  // meilleure série de la saison
  let best = 0, run = 0; results.forEach((r) => { if (r.win) { run++; best = Math.max(best, run); } else run = 0; });
  if (best >= 3) badges.push({ ic: B.trend, label: 'Série record', detail: `${best} victoires consécutives` });
  // forteresse (invaincu à domicile)
  const homeGames = results.filter((r) => r.home);
  if (homeGames.length >= 2 && homeGames.every((r) => r.win)) badges.push({ ic: B.shield, label: 'Forteresse', detail: `Invaincu à domicile (${homeGames.length} matchs)` });
  // plus large victoire
  const wins = results.filter((r) => r.win);
  if (wins.length) {
    const bw = wins.slice().sort((a, b) => b.margin - a.margin)[0];
    if (bw.margin >= 15) badges.push({ ic: B.bolt, label: 'Démonstration', detail: `+${bw.margin} contre ${esc(bw.oppTeam?.short_name || bw.oppTeam?.name || 'un adversaire')}` });
  }
  // classements du championnat (meilleure attaque / défense / différentiel)
  const stats = allStats || [];
  const myRows = stats.filter((s) => s.team_id === teamId && Number(s.games) >= 2);
  const myStat = myRows.slice().sort((a, b) => Number(b.games) - Number(a.games))[0] || null;
  if (myStat) {
    const league = stats.filter((s) => s.competition_id === myStat.competition_id && Number(s.games) >= 2);
    if (league.length >= 2) {
      if (league.slice().sort((a, b) => Number(b.pts_for) - Number(a.pts_for))[0].team_id === teamId)
        badges.push({ ic: B.target, label: 'Meilleure attaque', detail: `${round1(Number(myStat.pts_for))} pts marqués/match` });
      if (league.slice().sort((a, b) => Number(a.pts_against) - Number(b.pts_against))[0].team_id === teamId)
        badges.push({ ic: B.shield, label: 'Meilleure défense', detail: `${round1(Number(myStat.pts_against))} pts encaissés/match` });
      if (league.slice().sort((a, b) => Number(b.diff) - Number(a.diff))[0].team_id === teamId)
        badges.push({ ic: B.crown, label: 'Meilleur différentiel', detail: `+${round1(Number(myStat.diff))} de moyenne` });
    }
  }
  return badges;
}
function teamBadgesHtml(badges) {
  if (!badges.length) return '';
  return `<div class="block"><div class="block-head"><h2>${bhIco('<path d="M3 7l4 4 5-6 5 6 4-4v11H3z"/>')}Trophées & distinctions</h2></div><div class="badge-grid">${badges.map((b) => `<div class="badge-card"><span class="badge-ic">${icoSvg(b.ic)}</span><b class="badge-lbl">${esc(b.label)}</b><span class="badge-detail">${b.detail}</span></div>`).join('')}</div></div>`;
}

// --------------------------------------------------------------- init
// -- thème clair / sombre (mémorisé)
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('fgbb-theme', mode); } catch {}
  const b = $('#themeToggle');
  if (b) b.innerHTML = mode === 'light' ? MOON_SVG : SUN_SVG;
}
function initTheme() {
  let mode = 'dark';
  try { mode = localStorage.getItem('fgbb-theme') || 'dark'; } catch {}
  applyTheme(mode);
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
}

function wireStaticEvents() {
  initTheme();
  $('#themeToggle')?.addEventListener('click', toggleTheme);
  // onglets
  document.querySelectorAll('.app-tab').forEach((t) =>
    t.addEventListener('click', () => { location.hash = t.dataset.route; }),
  );
  // en-tête (boutons initiaux présents dans le HTML)
  $('#btnLoginHeader')?.addEventListener('click', () => openAuth('login'));
  $('#btnSignupHeader')?.addEventListener('click', () => openAuth('signup'));
  // modale
  $('#authClose').addEventListener('click', closeAuth);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAuth(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeAuth(); });
  $('#tabLogin').addEventListener('click', () => setAuthMode('login'));
  $('#tabSignup').addEventListener('click', () => setAuthMode('signup'));
  $('#authForm').addEventListener('submit', onAuthSubmit);
  // navigation par hash
  window.addEventListener('hashchange', handleHash);
}

async function init() {
  wireStaticEvents();
  fetchTeamsMap(); // préchargement en tâche de fond
  if (pushSupported()) ensureServiceWorker(); // enregistre le SW (réception des notifications)

  // session courante
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) { await loadProfile(session.user.id); await safe(loadMyClubs(), []); }
  renderAuthArea();

  // réagir aux changements (connexion / déconnexion)
  sb.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!newSession) { profile = null; myClubsCache = []; renderAuthArea(); if (currentRoute === 'accueil') render('accueil'); return; }
    setTimeout(async () => {
      await loadProfile(newSession.user.id);
      await safe(loadMyClubs(), []);
      renderAuthArea();
      if (currentRoute === 'accueil') render('accueil');
    }, 0);
  });

  handleHash(); // première vue
}

init();
