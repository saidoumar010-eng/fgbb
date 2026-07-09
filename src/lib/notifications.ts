import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';

// Affiche les notifications même quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Enregistre le jeton push de l'appareil dans le profil de l'utilisateur.
export async function registerForPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!Device.isDevice) {
    return { ok: false, error: 'Les notifications push nécessitent un appareil physique.' };
  }
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { ok: false, error: 'Permission de notification refusée.' };

  const projectId =
    (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  try {
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Impossible d’obtenir le jeton push.' };
  }
}

export async function unregisterPush(userId: string) {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}

// Déclenche l'envoi de notifications (best-effort, ne bloque jamais l'action admin).
export async function notifySubscribers(input: { title: string; body: string; team_ids?: string[] }) {
  try {
    await supabase.functions.invoke('send-push', { body: input });
  } catch {
    // ignore
  }
}
