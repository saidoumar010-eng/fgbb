import AsyncStorage from '@react-native-async-storage/async-storage';

import { listMatches } from '@/lib/db';
import { teamShort } from '@/lib/format';
import type { Match } from '@/lib/types';

// Données du widget d'écran d'accueil : prochain match et dernier résultat.
//
// Ce module est volontairement PUR JS (aucune dépendance native) : il calcule
// l'instantané et le range dans AsyncStorage. Le widget natif (Android
// App Widget via react-native-android-widget, ou iOS WidgetKit) lit cet
// instantané et l'affiche. Le branchement natif est décrit dans WIDGET.md ;
// il n'est pas importé ici pour que l'app web/Expo Go continue de tourner.

const STORAGE_KEY = 'fgbb.widget.snapshot';

export interface WidgetMatch {
  matchId: string;
  homeShort: string;
  awayShort: string;
  homeName: string;
  awayName: string;
  competition: string | null;
  scheduledAt: string | null;
}

export interface WidgetResult extends WidgetMatch {
  homeScore: number;
  awayScore: number;
}

export interface WidgetSnapshot {
  updatedAt: string;
  next: WidgetMatch | null;
  last: WidgetResult | null;
}

function toWidgetMatch(m: Match): WidgetMatch {
  return {
    matchId: m.id,
    homeShort: m.home_team ? teamShort(m.home_team) : '—',
    awayShort: m.away_team ? teamShort(m.away_team) : '—',
    homeName: m.home_team?.name ?? '—',
    awayName: m.away_team?.name ?? '—',
    competition: m.competition?.name ?? null,
    scheduledAt: m.scheduled_at,
  };
}

/**
 * Construit l'instantané : le prochain match programmé (le plus proche) et le
 * dernier match terminé (le plus récent). Aucune écriture — utile pour tester.
 */
export async function buildWidgetSnapshot(nowIso: string): Promise<WidgetSnapshot> {
  const [scheduled, finished] = await Promise.all([
    listMatches({ status: 'scheduled', limit: 60 }),
    listMatches({ status: 'finished', limit: 60 }),
  ]);

  const now = Date.parse(nowIso);
  const next =
    scheduled
      // scheduled_at est croissant ; on garde le premier encore à venir.
      .filter((m) => m.scheduled_at && Date.parse(m.scheduled_at) >= now)
      .map(toWidgetMatch)[0] ?? null;

  const lastMatch =
    [...finished]
      .sort((a, b) => (Date.parse(b.scheduled_at ?? '') || 0) - (Date.parse(a.scheduled_at ?? '') || 0))[0] ?? null;

  const last: WidgetResult | null = lastMatch
    ? { ...toWidgetMatch(lastMatch), homeScore: lastMatch.home_score, awayScore: lastMatch.away_score }
    : null;

  return { updatedAt: nowIso, next, last };
}

/** Calcule puis persiste l'instantané. Silencieux en cas d'échec réseau. */
export async function refreshWidgetData(nowIso: string): Promise<WidgetSnapshot | null> {
  try {
    const snap = await buildWidgetSnapshot(nowIso);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    return snap;
  } catch {
    return null;
  }
}

/** Dernier instantané rangé sur l'appareil (lu par le widget natif au réveil). */
export async function readWidgetData(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}
