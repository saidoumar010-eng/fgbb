import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { followPlayer, getPlayerFollowerCount, isFollowingPlayer, unfollowPlayer } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { C, R } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Abonnement à un joueur : bouton de suivi et compteur public. Un visiteur non
 * connecté est envoyé vers l'écran de connexion plutôt que de voir un bouton
 * qui échouerait.
 */
export function PlayerFollow({ playerId }: { playerId: string }) {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id;
  const countQ = useFetch(() => getPlayerFollowerCount(playerId), [playerId]);
  const followingQ = useFetch(
    () => (uid ? isFollowingPlayer(uid, playerId) : Promise.resolve(false)),
    [uid, playerId],
  );
  const [busy, setBusy] = useState(false);

  const following = followingQ.data ?? false;
  const count = countQ.data ?? 0;

  async function toggle() {
    if (!uid) {
      router.push('/login');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (following) await unfollowPlayer(uid, playerId);
      else await followPlayer(uid, playerId);
      await Promise.all([followingQ.reload(), countQ.reload()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row style={{ gap: 12, marginTop: 13, alignItems: 'center' }}>
      <Pressable
        onPress={toggle}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            borderRadius: R.pill,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: following ? C.accent : C.borderStrong,
            backgroundColor: following ? C.accentSoft : 'transparent',
          },
          (pressed || busy) && { opacity: 0.7 },
        ]}>
        <Ionicons
          name={following ? 'heart' : 'heart-outline'}
          size={16}
          color={following ? C.accent : C.muted}
        />
        <Text style={{ color: following ? C.accent : C.text, fontSize: 13, fontWeight: '600' }}>
          {following ? t('Abonné') : t('Suivre')}
        </Text>
      </Pressable>
      <Text style={{ color: C.dim, fontSize: 12.5 }}>
        {count === 1 ? t('{n} abonné', { n: count }) : t('{n} abonnés', { n: count })}
      </Text>
    </Row>
  );
}
