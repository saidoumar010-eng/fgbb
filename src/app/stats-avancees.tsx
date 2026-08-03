import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listTeamAdvancedStats } from '@/lib/db-stats';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { TeamAdvancedStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Metric = 'efg_pct' | 'tov_pct' | 'orb_pct' | 'ft_rate';

// Les four factors. Le turnover est le seul « moins = mieux » : on le signale.
const METRICS: { id: Metric; label: string; hint: string; lowerBetter?: boolean }[] = [
  { id: 'efg_pct', label: '% de tir effectif', hint: 'Réussite au tir, primes aux 3 points' },
  { id: 'tov_pct', label: 'Taux de balles perdues', hint: 'Moins c’est mieux', lowerBetter: true },
  { id: 'orb_pct', label: 'Rebonds offensifs', hint: 'Secondes chances captées' },
  { id: 'ft_rate', label: 'Lancers francs', hint: 'Fréquence des lancers francs' },
];

export default function AdvancedStatsScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listTeamAdvancedStats());
  const [metric, setMetric] = useState<Metric>('efg_pct');
  const [refreshing, setRefreshing] = useState(false);

  const current = METRICS.find((m) => m.id === metric)!;
  const rows = useMemo(() => {
    const all = [...(data ?? [])];
    all.sort((a, b) => (current.lowerBetter ? a[metric] - b[metric] : b[metric] - a[metric]));
    return all;
  }, [data, metric, current.lowerBetter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Statistiques avancées')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingLeft: S.lg, paddingTop: S.md }}>
        <ChipSelect
          options={METRICS.map((m) => ({ id: m.id, label: t(m.label) }))}
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
        />
      </View>

      {rows.length === 0 ? (
        <Empty
          icon="stats-chart-outline"
          title={loading ? t('Chargement…') : t('Aucune statistique')}
          subtitle={loading ? undefined : t('Les indicateurs avancés apparaîtront après quelques matchs.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          <Text style={{ color: C.dim, fontSize: 12.5 }}>{t(current.hint)}</Text>
          <Card style={{ paddingHorizontal: 13, paddingVertical: 4 }}>
            {rows.map((r, i) => (
              <AdvRow key={r.team_id} row={r} rank={i + 1} metric={metric} last={i === rows.length - 1} />
            ))}
          </Card>
          <Text style={{ color: C.dim, fontSize: 11, lineHeight: 16 }}>
            {t('eFG% = (paniers + 0,5 × 3pts) / tentatives. Indicateurs calculés sur les box scores de la saison.')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

function AdvRow({
  row,
  rank,
  metric,
  last,
}: {
  row: TeamAdvancedStat;
  rank: number;
  metric: Metric;
  last: boolean;
}) {
  const { t } = useT();
  return (
    <Pressable onPress={() => router.push(`/team/${row.team_id}`)}>
      <Row
        style={{
          paddingVertical: 11,
          gap: 10,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: C.border,
        }}>
        <Text style={{ color: rank <= 3 ? C.accent : C.dim, fontSize: 13, fontWeight: '600', width: 18 }}>
          {rank}
        </Text>
        <Crest label={teamShort({ short_name: row.short_name, name: row.team_name })} color={row.color ?? C.surface2} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>
            {row.team_name}
          </Text>
          <Text style={{ color: C.dim, fontSize: 11 }}>{t('{n} matchs', { n: row.games })}</Text>
        </View>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{row[metric]}%</Text>
      </Row>
    </Pressable>
  );
}
