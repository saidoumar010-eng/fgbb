import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { Empty, Header, Screen } from '@/components/ui';
import { listMatches } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { useMatchesRealtime } from '@/lib/realtime';
import { C, R, S } from '@/lib/theme';
import type { MatchStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const FILTERS: { key: MatchStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'live', label: 'En direct' },
  { key: 'scheduled', label: 'À venir' },
  { key: 'finished', label: 'Terminés' },
];

export default function MatchsScreen() {
  const { t } = useT();
  const [filter, setFilter] = useState<MatchStatus | 'all'>('all');
  const { data, loading, reload } = useFetch(() => listMatches());
  useMatchesRealtime(reload);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  const all = data ?? [];
  const shown = filter === 'all' ? all : all.filter((m) => m.status === filter);

  return (
    <Screen scroll={false}>
      <Header
        title={t('Matchs')}
        right={<Ionicons name="search-outline" size={22} color={C.muted} onPress={() => router.push('/search')} />}
      />
      <View style={{ paddingVertical: S.md }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, gap: 8 }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  backgroundColor: on ? C.accent : C.chipBg,
                  borderRadius: R.pill,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}>
                <Text style={{ color: on ? C.accentText : C.muted, fontSize: 12, fontWeight: '600' }}>
                  {t(f.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: S.lg, gap: 9, paddingBottom: S.xl * 2 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}>
        {shown.length > 0 ? (
          shown.map((m) => (
            <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
          ))
        ) : (
          <Empty
            icon="calendar-outline"
            title={loading ? t('Chargement…') : t('Aucun match')}
            subtitle={loading ? undefined : t('Les matchs ajoutés par la fédération apparaîtront ici.')}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
