import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Row } from '@/components/ui';
import { computeBadges, earnedCount, type EarnedBadge } from '@/lib/badges';
import { useT } from '@/lib/i18n';
import { C, R } from '@/lib/theme';
import type { FanStats } from '@/lib/types';

/**
 * Vitrine des badges du supporter. Les badges obtenus s'affichent en couleur ;
 * les autres restent grisés avec la progression vers le seuil, pour donner un
 * objectif clair plutôt qu'une simple absence.
 */
export function BadgeShelf({ stats }: { stats: FanStats | null }) {
  const { t } = useT();
  const badges = computeBadges(stats);
  const got = earnedCount(badges);

  return (
    <View style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{t('Mes badges')}</Text>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          {t('{got} sur {total}', { got, total: badges.length })}
        </Text>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {badges.map((b) => (
          <BadgeTile key={b.def.id} badge={b} />
        ))}
      </View>
    </View>
  );
}

function BadgeTile({ badge }: { badge: EarnedBadge }) {
  const { t } = useT();
  const { def, earned, value } = badge;
  const tint = earned ? def.color : C.dim;

  return (
    <View
      style={{
        width: '31%',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: earned ? def.color : C.border,
        backgroundColor: earned ? 'rgba(255,255,255,0.04)' : 'transparent',
        opacity: earned ? 1 : 0.72,
      }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: earned ? def.color : C.surface2,
        }}>
        <Ionicons name={def.icon} size={22} color={earned ? C.bg : C.dim} />
      </View>
      <Text style={{ color: earned ? C.text : C.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
        {t(def.label)}
      </Text>
      <Text style={{ color: tint, fontSize: 10, textAlign: 'center' }} numberOfLines={1}>
        {earned ? t('Obtenu') : t('{value}/{goal}', { value, goal: def.goal })}
      </Text>
    </View>
  );
}
