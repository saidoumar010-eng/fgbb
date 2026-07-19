import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { getMatchSheetData } from '@/lib/db-stats';
import { fullDate } from '@/lib/format';
import type { Match, PlayerMatchStat } from '@/lib/types';

// La feuille de match est un document officiel de la fédération : elle reste
// en français quelle que soit la langue de l'application.

export async function exportMatchSheetPdf(matchId: string) {
  const { match, stats } = await getMatchSheetData(matchId);
  const html = matchSheetHtml(match, stats);

  // Sur le web, printToFileAsync n'existe pas : on ouvre la boîte d'impression
  // du navigateur, qui permet aussi d'enregistrer en PDF.
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Feuille de match',
    });
  }
}

export async function exportCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const name = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Le BOM évite qu'Excel massacre les accents à l'ouverture.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  // Sans expo-file-system, on partage le contenu texte : l'utilisateur choisit
  // l'application (mail, notes, Drive) qui recevra le tableau.
  await Share.share({ message: csv, title: name });
}

function csvCell(v: string | number) {
  const s = String(v ?? '');
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------------------------------------------------------
// Génération du HTML de la feuille de match (noir sur blanc, pensé imprimé).

function matchSheetHtml(m: Match, stats: PlayerMatchStat[]) {
  const home = m.home_team?.name ?? 'Équipe A';
  const away = m.away_team?.name ?? 'Équipe B';
  const homeStats = stats.filter((s) => s.team_id === m.home_team_id);
  const awayStats = stats.filter((s) => s.team_id === m.away_team_id);
  const sub = [m.competition?.name, fullDate(m.scheduled_at), m.venue].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  @page { margin: 18mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 11px; margin: 0; }
  .fed { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
  .fed h1 { font-size: 15px; margin: 0; letter-spacing: 1px; text-transform: uppercase; }
  .fed p { font-size: 10px; margin: 3px 0 0; letter-spacing: 3px; text-transform: uppercase; }
  .poster { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .poster .team { flex: 1; font-size: 16px; font-weight: bold; }
  .poster .team.away { text-align: right; }
  .poster .score { font-size: 26px; font-weight: bold; padding: 0 14px; white-space: nowrap; }
  .meta { text-align: center; font-size: 10.5px; color: #333; margin-bottom: 14px; }
  h2 { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.6px; margin: 16px 0 5px; border-bottom: 1px solid #000; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 3px 4px; text-align: center; }
  th { background: #eee; font-size: 9.5px; text-transform: uppercase; }
  td.name, th.name { text-align: left; }
  tr.total td { font-weight: bold; background: #f2f2f2; }
  .quarters { width: auto; min-width: 55%; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; font-size: 9.5px; color: #444; }
  .sign { border-top: 1px solid #000; padding-top: 3px; width: 30%; text-align: center; }
</style></head>
<body>
  <div class="fed">
    <h1>Fédération Guinéenne de Basketball</h1>
    <p>Feuille de match</p>
  </div>

  <div class="poster">
    <div class="team">${esc(home)}</div>
    <div class="score">${m.home_score} – ${m.away_score}</div>
    <div class="team away">${esc(away)}</div>
  </div>
  <div class="meta">${esc(sub)}</div>

  ${quartersTable(m)}

  <h2>${esc(home)}</h2>
  ${boxScoreTable(homeStats)}

  <h2>${esc(away)}</h2>
  ${boxScoreTable(awayStats)}

  <div class="foot">
    <div class="sign">Arbitre principal</div>
    <div class="sign">Commissaire</div>
    <div class="sign">Marqueur</div>
  </div>
</body></html>`;
}

function quartersTable(m: Match) {
  const qs = m.quarter_scores ?? [];
  if (qs.length === 0) return '';
  const head = qs.map((q) => `<th>Q${q.q}</th>`).join('');
  const home = qs.map((q) => `<td>${q.home}</td>`).join('');
  const away = qs.map((q) => `<td>${q.away}</td>`).join('');
  return `<h2>Scores par quart-temps</h2>
  <table class="quarters">
    <tr><th class="name">Équipe</th>${head}<th>Total</th></tr>
    <tr><td class="name">${esc(m.home_team?.name ?? '')}</td>${home}<td><b>${m.home_score}</b></td></tr>
    <tr><td class="name">${esc(m.away_team?.name ?? '')}</td>${away}<td><b>${m.away_score}</b></td></tr>
  </table>`;
}

function boxScoreTable(rows: PlayerMatchStat[]) {
  if (rows.length === 0) return '<p>Aucune statistique saisie.</p>';
  const sum = (f: (s: PlayerMatchStat) => number) => rows.reduce((n, s) => n + (f(s) || 0), 0);
  const body = rows
    .map(
      (s) => `<tr>
      <td>${s.player?.number ?? ''}</td>
      <td class="name">${esc(s.player?.full_name ?? '')}</td>
      <td>${s.minutes}</td><td><b>${s.points}</b></td><td>${s.rebounds}</td><td>${s.assists}</td>
      <td>${s.steals}</td><td>${s.blocks}</td><td>${s.turnovers}</td><td>${s.fouls}</td>
      <td>${s.fg_made}/${s.fg_att}</td><td>${s.three_made}/${s.three_att}</td><td>${s.ft_made}/${s.ft_att}</td>
    </tr>`,
    )
    .join('');

  return `<table>
    <tr>
      <th>N°</th><th class="name">Joueur</th><th>Min</th><th>Pts</th><th>Reb</th><th>Pd</th>
      <th>Int</th><th>Ctr</th><th>Bp</th><th>F</th><th>Tirs</th><th>3 pts</th><th>LF</th>
    </tr>
    ${body}
    <tr class="total">
      <td></td><td class="name">Total</td>
      <td>${sum((s) => s.minutes)}</td><td>${sum((s) => s.points)}</td><td>${sum((s) => s.rebounds)}</td>
      <td>${sum((s) => s.assists)}</td><td>${sum((s) => s.steals)}</td><td>${sum((s) => s.blocks)}</td>
      <td>${sum((s) => s.turnovers)}</td><td>${sum((s) => s.fouls)}</td>
      <td>${sum((s) => s.fg_made)}/${sum((s) => s.fg_att)}</td>
      <td>${sum((s) => s.three_made)}/${sum((s) => s.three_att)}</td>
      <td>${sum((s) => s.ft_made)}/${sum((s) => s.ft_att)}</td>
    </tr>
  </table>`;
}

function esc(v: unknown) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(v ?? '').replace(/[&<>"]/g, (c) => map[c]);
}
