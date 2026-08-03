import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Row, Screen } from '@/components/ui';
import {
  formatGnf,
  listSanctionsForTeam,
  sanctionKindLabel,
  sanctionStatusLabel,
} from '@/lib/db-officials';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Sanction, SanctionStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const STATUS_COLOR: Record<SanctionStatus, string> = {
  active: C.red,
  served: C.green,
  cancelled: C.dim,
};

// Discipline vue par le club : ses propres sanctions et amendes. Lecture seule
// (les sanctions sont publiques ; on filtre ici sur l'équipe du club).
export default function ClubDisciplineScreen() {
  const { t } = useT();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const { data, loading, reload } = useFetch(
    () => (team ? listSanctionsForTeam(team) : Promise.resolve([] as Sanction[])),
    [team],
  );
  const [refreshing, setRefreshing] = useState(false);

  const rows = data ?? [];
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Discipline')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {rows.length === 0 ? (
        <Empty
          icon="shield-checkmark-outline"
          title={loading ? t('Chargement…') : t('Aucune sanction')}
          subtitle={loading ? undefined : t('Ton club n’a aucune sanction enregistrée. Continuez comme ça !')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 9 }}>
          {rows.map((s) => (
            <Card key={s.id}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {s.player?.full_name ?? t('Équipe')}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: R.pill,
                    backgroundColor: `${STATUS_COLOR[s.status]}22`,
                  }}>
                  <Text style={{ color: STATUS_COLOR[s.status], fontSize: 11, fontWeight: '700' }}>
                    {t(sanctionStatusLabel(s.status))}
                  </Text>
                </View>
              </Row>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>
                {[
                  t(sanctionKindLabel(s.kind)),
                  s.games ? t('{n} match(s)', { n: s.games }) : null,
                  s.amount_gnf ? formatGnf(s.amount_gnf) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {s.reason ? (
                <Text style={{ color: C.dim, fontSize: 12, marginTop: 5 }} numberOfLines={3}>
                  {s.reason}
                </Text>
              ) : null}
              {s.decided_at ? (
                <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{fullDate(s.decided_at)}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
