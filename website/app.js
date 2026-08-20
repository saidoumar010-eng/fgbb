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

// --------------------------------------------------------------- helpers DOM
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
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

function matchCardHtml(m) {
  const home = m.home_team, away = m.away_team;
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const homeWin = done && m.home_score > m.away_score;
  const awayWin = done && m.away_score > m.home_score;
  const comp = m.competition?.name || 'Match';
  const roundTxt = m.round ? ` · J${m.round}` : '';

  let center;
  if (live || done) {
    center = `<div class="mscore"><span class="${awayWin ? 'loser' : ''}">${m.home_score ?? 0}</span><span class="sep">:</span><span class="${homeWin ? 'loser' : ''}">${m.away_score ?? 0}</span></div>`;
  } else {
    center = `<div class="mtime">${fmtTime(m.scheduled_at) || '—'}</div>`;
  }

  let status;
  if (live) status = `<span class="pill live">Q${m.current_quarter || 1} · En direct</span>`;
  else if (done) status = `<span class="pill done">Terminé</span>`;
  else status = `<span class="pill next">${fmtDate(m.scheduled_at)}</span>`;

  return `<a class="match" href="#match/${m.id}">
    <div class="match-meta"><span>${esc(comp)}${roundTxt}</span><span>${live || done ? fmtDate(m.scheduled_at) : ''}</span></div>
    <div class="match-body">
      <div class="mteam">${logoHtml(home)}<span class="mn">${esc(home?.name || 'Équipe')}</span></div>
      ${center}
      <div class="mteam away">${logoHtml(away)}<span class="mn">${esc(away?.name || 'Équipe')}</span></div>
    </div>
    <div class="mstatus">${status}${m.venue ? `<span style="color:var(--dim);font-size:12px">${esc(m.venue)}</span>` : ''}</div>
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
  view.innerHTML = `<h1 class="view-title">Classement</h1><p class="view-sub">2 points par victoire, 1 par défaite (règles FIBA).</p><div id="clsFilter"></div><div id="clsBody">${loadingHtml()}</div>`;

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
  const homeWin = done && m.home_score > m.away_score;
  const awayWin = done && m.away_score > m.home_score;
  const scoreShown = live || done;
  const statusPill = live
    ? `<span class="pill live">Q${m.current_quarter || 1} · En direct</span>`
    : done ? `<span class="pill done">Terminé</span>`
    : `<span class="pill next">${fmtDate(m.scheduled_at)} · ${fmtTime(m.scheduled_at)}</span>`;

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

  const meta = [m.competition?.name, m.round ? 'Journée ' + m.round : null, fmtDate(m.scheduled_at), m.venue].filter(Boolean).join(' · ');

  let html = backBtnHtml();
  html += `<div class="md-board">
    <div class="md-meta">${esc(meta)}</div>
    <div class="md-teams">
      <a class="md-team" href="#team/${m.home_team_id}">${logoHtml(m.home_team, 'mlogo')}<span class="md-tn ${awayWin ? 'loser' : ''}">${esc(m.home_team?.name || '')}</span></a>
      <div class="md-center">
        ${scoreShown
          ? `<div class="md-score"><span class="${awayWin ? 'loser' : ''}">${m.home_score ?? 0}</span><span class="sep">:</span><span class="${homeWin ? 'loser' : ''}">${m.away_score ?? 0}</span></div>`
          : `<div class="md-vs">VS</div>`}
        <div class="md-status">${statusPill}</div>
      </div>
      <a class="md-team" href="#team/${m.away_team_id}">${logoHtml(m.away_team, 'mlogo')}<span class="md-tn ${homeWin ? 'loser' : ''}">${esc(m.away_team?.name || '')}</span></a>
    </div>
    ${qs}
    ${m.video_url ? `<a class="btn sm" style="margin-top:16px" href="${esc(m.video_url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none"/></svg>Voir la vidéo</a>` : ''}
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
  html += `<div id="officialsSlot"></div><div id="fanSlot"></div><div id="photosSlot"></div><div id="chatSlot"></div><div id="h2hSlot"></div><div id="commentsSlot"></div>`;

  view.innerHTML = html;
  wireBack();
  fillOfficials(m.id);
  fillMatchFan(m, stats);
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
  const [t, players, standing, matches, isFav] = await Promise.all([safe(getTeam(id), null), safe(getTeamPlayers(id), []), safe(getTeamStanding(id), null), safe(getTeamMatches(id), []), uid ? safe(isFavoriteTeam(uid, id), false) : Promise.resolve(false)]);
  if (!t) { view.innerHTML = backBtnHtml() + errorHtml(); wireBack(); return; }
  let html = backBtnHtml();
  html += `<div class="profile">
    <div class="profile-ava" style="border-radius:16px;background:${esc(t.color || 'var(--teal)')}">${t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : esc(t.short_name || initials(t.name))}</div>
    <div class="profile-info"><h1>${esc(t.name)}</h1><div class="profile-sub">${[t.city, t.coach ? 'Coach : ' + esc(t.coach) : null].filter(Boolean).join(' · ') || 'Club'}</div>${followBtnHtml(isFav, 'Ajouter aux favoris', 'Dans mes favoris')}${socialLinksHtml(t, TEAM_SOCIALS)}</div>
  </div>`;
  if (standing) {
    html += `<div class="block"><div class="stat-grid">${statTile(standing.points, 'Points', true)}${statTile(standing.wins, 'Victoires', true)}${statTile(standing.losses, 'Défaites', true)}${statTile(standing.played, 'Joués', true)}</div></div>`;
  }
  if (players.length) {
    const rows = players.map((pl) => `<a class="roster-row" href="#player/${pl.id}"><span class="bx-num">${pl.number ?? ''}</span><span class="rr-name">${esc(pl.full_name)}</span><span class="rr-pos">${esc(pl.position || '')}</span></a>`).join('');
    html += `<div class="block"><div class="block-head"><h2>Effectif</h2></div><div class="roster">${rows}</div></div>`;
  }
  const live = matches.filter((m) => m.status === 'live');
  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const done = matches.filter((m) => m.status === 'finished');
  const show = [...live, ...upcoming.slice(0, 5), ...done.slice(-5).reverse()];
  if (show.length) html += `<div class="block"><div class="block-head"><h2>Matchs</h2></div>${show.map(matchCardHtml).join('')}</div>`;
  if (!players.length && !matches.length && !standing) html += emptyHtml('Fiche à compléter', 'Les informations de ce club seront publiées prochainement.', 'ball');
  view.innerHTML = html; wireBack();
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
  view.innerHTML = `<h1 class="view-title">Clubs</h1><p class="view-sub">Les équipes engagées.</p><div id="clubBody">${loadingHtml()}</div>`;
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
  const active = polls.filter((p) => p.is_active);
  if (!active.length) { el.innerHTML = emptyHtml('Aucun sondage', 'Les sondages de la fédération apparaîtront ici.', 'news'); return; }
  el.innerHTML = '';
  for (const p of active) el.appendChild(await pollCardEl(p));
}
async function pollCardEl(p) {
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
      try { await votePoll(p.id, uid, Number(b.dataset.i)); toast('Vote enregistré'); renderFanzone(); }
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
  const [teams, players] = await Promise.all([safe(listFavoriteTeams(), []), safe(listFollowedPlayers(), [])]);
  let html = '';
  if (teams.length) html += `<div class="block"><div class="block-head"><h2>Clubs favoris</h2></div><div class="club-grid">${teams.map((t) => `<a class="club-card" href="#team/${t.id}">${logoHtml(t)}<span class="cc-name">${esc(t.name)}</span></a>`).join('')}</div></div>`;
  if (players.length) html += `<div class="block"><div class="block-head"><h2>Joueurs suivis</h2></div><div class="roster">${players.map((p) => `<a class="roster-row" href="#player/${p.id}"><span class="lava" style="width:32px;height:32px;font-size:12px">${initials(p.full_name)}</span><span class="rr-name">${esc(p.full_name)}</span></a>`).join('')}</div></div>`;
  el.innerHTML = html || emptyHtml('Rien pour le moment', 'Ajoutez des clubs et joueurs en favoris depuis leur fiche.', 'trophy');
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
    { r: 'admin-players', label: 'Joueurs', ic: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/>' },
    { r: 'admin-competitions', label: 'Compétitions', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'admin-poules', label: 'Poules', ic: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0112 0M14 20a5 5 0 017-4.5"/>' },
    { r: 'admin-playoffs', label: 'Playoffs', ic: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/>' },
    { r: 'admin-socials', label: 'Réseaux sociaux', ic: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>' },
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

let poComp;
async function renderPlayoffs() {
  view.innerHTML = `<h1 class="view-title">Playoffs</h1><p class="view-sub">Le tableau final : les 4 premiers de chaque poule.</p><div id="poFilter"></div><div id="poBody">${loadingHtml()}</div>`;
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
  const byRound = {};
  matches.forEach((m) => { const k = m.playoff_round || 'autre'; (byRound[k] = byRound[k] || []).push(m); });
  let html = PLAYOFF_ROUNDS.filter((r) => byRound[r.key]).map((r) => `<div class="block"><div class="block-head"><h2>${r.label}</h2></div>${byRound[r.key].map(matchCardHtml).join('')}</div>`).join('');
  if (byRound.autre) html += `<div class="block"><div class="block-head"><h2>Autres matchs</h2></div>${byRound.autre.map(matchCardHtml).join('')}</div>`;
  body.innerHTML = html;
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
    ? matches.map((m) => `<div class="roster-row"><span class="rr-name"><b>${playoffRoundLabel(m.playoff_round)}</b> · ${esc(m.home_team?.name || '?')} — ${esc(m.away_team?.name || '?')}</span><button class="mini-del" data-del="${m.id}" aria-label="Supprimer">✕</button></div>`).join('')
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
  $('#apoBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await deleteMatch(b.dataset.del); toast('Match supprimé'); renderAdminPlayoffs(); }
    catch (err) { toast(errMsg(err)); b.disabled = false; }
  }));
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
function labelOf(list, v) { return (list.find((o) => o.value === v) || {}).label || v || ''; }

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
  itemSub: (t) => [t.short_name, t.city, t.division].filter(Boolean).join(' · '),
  fields: [
    { k: 'name', label: 'Nom du club', type: 'text', required: true, placeholder: 'Ex. Tout Sport de Kaloum' },
    { k: 'short_name', label: 'Sigle', type: 'text', placeholder: 'Ex. TSK' },
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
    if (f.type === 'number') patch[f.k] = raw === '' ? null : Number(raw);
    else patch[f.k] = raw === '' ? null : raw;
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
      if (f.required && (patch[f.k] == null || patch[f.k] === '')) { toast(`« ${f.label} » est obligatoire`); return; }
    }
    const btn = $('#crudSave'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
      if (item) await cfg.update(item.id, patch); else await cfg.create(patch);
      toast(item ? 'Modifications enregistrées' : 'Création effectuée');
      renderAdminCrud(cfg);
    } catch (err) { toast(errMsg(err)); btn.disabled = false; btn.textContent = orig; }
  });
}

const RENDERERS = {
  accueil: renderAccueil,
  admin: renderAdmin,
  'admin-teams': () => renderAdminCrud(CRUD_TEAMS),
  'admin-players': () => renderAdminCrud(CRUD_PLAYERS),
  'admin-competitions': () => renderAdminCrud(CRUD_COMPS),
  'admin-poules': renderAdminPoules,
  'admin-socials': renderAdminSocials,
  'admin-playoffs': renderAdminPlayoffs,
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
const PLUS_ROUTES = ['plus', 'videos', 'clubs', 'playoffs', 'fanzone', 'recherche', 'favoris', 'apropos', 'comparateur', 'palmares', 'arbitres', 'discipline', 'medias', 'agenda', 'supporters', 'quiz', 'photos'];
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
  return { admin: 'Fédération', table_technique: 'Table technique', fan: 'Supporter' }[role] || 'Supporter';
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
          <a class="mi" href="index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>Site de la fédération</a>
          <a class="mi" href="confidentialite.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Confidentialité</a>
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

  // session courante
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) await loadProfile(session.user.id);
  renderAuthArea();

  // réagir aux changements (connexion / déconnexion)
  sb.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!newSession) { profile = null; renderAuthArea(); if (currentRoute === 'accueil') render('accueil'); return; }
    setTimeout(async () => {
      await loadProfile(newSession.user.id);
      renderAuthArea();
      if (currentRoute === 'accueil') render('accueil');
    }, 0);
  });

  handleHash(); // première vue
}

init();
