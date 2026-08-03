import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { teamShort } from '@/lib/format';
import type { Match } from '@/lib/types';

/**
 * Rappels de match : une notification locale programmée quelques minutes avant
 * le coup d'envoi. Purement local (aucun serveur) — le supporter choisit lui-même
 * les matchs qu'il veut suivre, et l'état survit au redémarrage grâce à
 * AsyncStorage, où l'on garde la correspondance match → identifiant de rappel.
 *
 * Le web ne sait pas programmer ce type de notification : on l'y désactive
 * franchement plutôt que d'échouer silencieusement.
 */

export const remindersSupported = Platform.OS !== 'web';
export const REMINDER_LEAD_MINUTES = 30;
const ANDROID_CHANNEL = 'match-reminders';
const STORAGE_KEY = 'fgbb.reminders';

interface Entry {
  notifId: string;
  fireAt: number; // horodatage du déclenchement, pour purger les rappels échus
}
type Store = Record<string, Entry>;

export type SetReminderResult =
  | { ok: true; fireAt: number }
  | { ok: false; reason: 'unsupported' | 'no_date' | 'too_late' | 'denied' | 'error' };

async function load(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

async function save(store: Store) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Un rappel non persisté reste programmé côté système : perte bénigne.
  }
}

/** Rappel actif pour ce match, ou null. Purge au passage une échéance dépassée. */
export async function getReminder(matchId: string): Promise<Entry | null> {
  const store = await load();
  const entry = store[matchId];
  if (!entry) return null;
  if (entry.fireAt <= Date.now()) {
    delete store[matchId];
    await save(store);
    return null;
  }
  return entry;
}

async function ensurePermission(): Promise<boolean> {
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  return status === 'granted';
}

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Rappels de match',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function setReminder(
  match: Match,
  leadMinutes = REMINDER_LEAD_MINUTES,
): Promise<SetReminderResult> {
  if (!remindersSupported) return { ok: false, reason: 'unsupported' };
  if (!match.scheduled_at) return { ok: false, reason: 'no_date' };

  const fireAt = new Date(match.scheduled_at).getTime() - leadMinutes * 60_000;
  // Marge de quelques secondes : programmer dans le passé n'a pas de sens.
  if (!Number.isFinite(fireAt) || fireAt <= Date.now() + 5_000) {
    return { ok: false, reason: 'too_late' };
  }
  if (!(await ensurePermission())) return { ok: false, reason: 'denied' };

  try {
    await ensureChannel();
    // Repart d'un état propre : jamais deux rappels pour le même match.
    await cancelReminder(match.id);

    const home = teamShort(match.home_team) || match.home_team?.name || '';
    const away = teamShort(match.away_team) || match.away_team?.name || '';
    const title = away ? `🏀 ${home} vs ${away}` : `🏀 ${home}`;

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: title.trim(),
        body: `Le match commence dans ${leadMinutes} minutes.`,
        data: { matchId: match.id, url: `/match/${match.id}` },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
    });

    const store = await load();
    store[match.id] = { notifId, fireAt };
    await save(store);
    return { ok: true, fireAt };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function cancelReminder(matchId: string): Promise<void> {
  const store = await load();
  const entry = store[matchId];
  if (!entry) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(entry.notifId);
  } catch {
    // Déjà déclenché ou introuvable : on retire quand même l'entrée locale.
  }
  delete store[matchId];
  await save(store);
}
