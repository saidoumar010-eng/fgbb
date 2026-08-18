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
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
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
  return `<div class="loading"><div class="spinner"></div>Chargement…</div>`;
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

function standingsHtml(rows) {
  if (!rows.length) return emptyHtml('Classement à venir', 'Le classement apparaîtra dès les premiers matchs joués.', 'trophy');
  const body = rows
    .map((r, i) => {
      const team = { name: r.team_name, short_name: r.short_name, color: r.color };
      return `<tr class="${i === 0 ? 'top' : ''}">
        <td class="rk">${i + 1}</td>
        <td class="team"><div class="team-cell">${logoHtml(team)}<a href="#team/${r.team_id}">${esc(r.team_name)}</a></div></td>
        <td class="hide-sm">${r.played}</td>
        <td>${r.wins}</td>
        <td class="hide-sm">${r.losses}</td>
        <td class="pts">${r.points}</td>
      </tr>`;
    })
    .join('');
  return `<div style="overflow-x:auto"><table class="standings">
    <thead><tr><th class="rk">#</th><th class="team">Équipe</th><th class="hide-sm">J</th><th>V</th><th class="hide-sm">D</th><th>Pts</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
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

  let html = `<h1 class="view-title">Bonjour${profile?.full_name ? ' ' + esc(profile.full_name.split(' ')[0]) : ''} 👋</h1>
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
      <div class="fh">${isLive ? '🔴 ' : ''}Match à la une${f.competition?.name ? ' · ' + esc(f.competition.name) : ''}</div>
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

  const rows = await safe(listStandings(compFilter || undefined), null);
  $('#clsBody').innerHTML = rows === null ? errorHtml() : standingsHtml(rows);
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
  html += `<div id="fanSlot"></div><div id="h2hSlot"></div>`;

  view.innerHTML = html;
  wireBack();
  fillMatchFan(m, stats);
  fillHeadToHead(m);

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
      ${followBtnHtml(following, 'Suivre', 'Suivi ✓')}
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
    <div class="profile-info"><h1>${esc(t.name)}</h1><div class="profile-sub">${[t.city, t.coach ? 'Coach : ' + esc(t.coach) : null].filter(Boolean).join(' · ') || 'Club'}</div>${followBtnHtml(isFav, 'Ajouter aux favoris', 'Favori ✓')}</div>
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
  </article>`;
  view.innerHTML = html; wireBack();
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
    { r: 'fanzone', label: 'Fan Zone', ic: '<path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z"/>' },
    { r: 'recherche', label: 'Recherche', ic: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' },
    { r: 'favoris', label: 'Mes favoris', ic: '<path d="M12 21s-7-4.6-9.5-8.3C.9 10.4 1.4 7 4 5.7 6 4.7 8.3 5.3 9.6 7L12 9.8 14.4 7c1.3-1.7 3.6-2.3 5.6-1.3 2.6 1.3 3.1 4.7 1.5 7C19 16.4 12 21 12 21z"/>' },
    { r: 'comparateur', label: 'Comparateur', ic: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
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
  let html = `<div class="ap-card"><img src="assets/logo-card.png" alt="Logo FGBB"><h2>Fédération Guinéenne de Basket-Ball</h2>${info.president ? `<p class="ap-pres">Président : ${esc(info.president)}</p>` : ''}<div class="tricolor" style="justify-content:center;margin-top:14px"><span class="r"></span><span class="y"></span><span class="g"></span></div></div>`;
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
async function renderCompare() {
  view.innerHTML = `<h1 class="view-title">Comparateur</h1><p class="view-sub">Comparez deux joueurs sur leurs moyennes de la saison.</p><div id="cmpPickers">${loadingHtml()}</div><div id="cmpBody"></div>`;
  const players = await safe(listPlayersLite(), []);
  const opts = ['<option value="">— Choisir un joueur —</option>'].concat(players.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`)).join('');
  $('#cmpPickers').innerHTML = `<div class="cmp-pickers"><select id="cmpA" class="cmp-select">${opts}</select><span class="cmp-vs">VS</span><select id="cmpB" class="cmp-select">${opts}</select></div>`;
  const run = async () => {
    const a = $('#cmpA').value, b = $('#cmpB').value;
    if (!a || !b) { $('#cmpBody').innerHTML = ''; return; }
    $('#cmpBody').innerHTML = loadingHtml();
    const [pa, pb, sa, sb2] = await Promise.all([safe(getPlayer(a), null), safe(getPlayer(b), null), safe(getPlayerSeason(a), null), safe(getPlayerSeason(b), null)]);
    $('#cmpBody').innerHTML = compareHtml(pa, pb, sa, sb2);
  };
  $('#cmpA').addEventListener('change', run);
  $('#cmpB').addEventListener('change', run);
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

const RENDERERS = {
  accueil: renderAccueil,
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
const PLUS_ROUTES = ['plus', 'videos', 'clubs', 'fanzone', 'recherche', 'favoris', 'apropos', 'comparateur'];
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
