import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listCompetitions } from '@/lib/db';
import { listTeamSeasonStats } from '@/lib/db-stats';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { TeamSeasonStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Mode = 'attaque' | 'defense' | 'diff';

const ALL = 'all';

// Bilans d'équipe : attaque, défense, différentiel — toujours par match.
export default function TeamStatsScreen() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>('attaque');
  const [compId, setCompId] = useState<string>(ALL);
  const [refreshing, setRefreshing] = useState(false);

  const competitions = useFetch(() => listCompetitions());
  const stats = useFetch(() => listTeamSeasonStats(compId === ALL ? null : compId), [compId]);

  const rows = useMemo(() => sortBy(stats.data ?? [], mode), [stats.data, mode]);
  // Échelle commune à toutes les barres pour que les longueurs soient comparables.
  const scale = useMemo(() => Math.max(1, ...rows.map((r) => Math.abs(value(r, mode)))), [rows, mode]);

  const onRefresh = async () => {
    setRefreshing(true);
    await stats.reload();
    setRefreshing(false);
  };

  const modes: { id: Mode; label: string }[] = [
    { id: 'attaque', label: t('Attaque') },
    { id: 'defense', label: t('Défense') },
    { id: 'diff', label: t('Différentiel') },
  ];
  const legend =
    mode === 'attaque'
      ? t('Points marqués par match')
      : mode === 'defense'
        ? t('Points encaissés par match')
        : t('Différence de points par match');

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Statistiques des équipes')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingLeft: S.lg, paddingTop: S.md }}>
        <ChipSelect options={modes} value={mode} onChange={(id) => setMode(id as Mode)} />
      </View>

      {(competitions.data ?? []).length > 0 && (
        <View style={{ paddingLeft: S.lg, paddingTop: S.sm }}>
          <ChipSelect
            options={[
              { id: ALL, label: t('Toutes les compétitions') },
              ...(competitions.data ?? []).map((c) => ({ id: c.id, label: c.name })),
            ]}
            value={compId}
            onChange={setCompId}
          />
        </View>
      )}

      {rows.length === 0 ? (
        <Empty
          icon="stats-chart-outline"
          title={stats.loading ? t('Chargement…') : t('Aucune statistique')}
          subtitle={stats.loading ? undefined : t('Les bilans apparaîtront dès que des matchs auront été joués.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          <Text style={{ color: C.dim, fontSize: 12.5 }}>{legend}</Text>
          <Card style={{ paddingHorizontal: 13, paddingVertical: 4 }}>
            {rows.map((r, i) => (
              <TeamRow key={r.team_id} row={r} rank={i + 1} mode={mode} scale={scale} last={i === rows.length - 1} />
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

function TeamRow({
  row,
  rank,
  mode,
  scale,
  last,
}: {
  row: TeamSeasonStat;
  rank: number;
  mode: Mode;
  scale: number;
  last: boolean;
}) {
  const { t } = useT();
  const v = value(row, mode);
  const ratio = Math.min(1, Math.abs(v) / scale);
  // Le différentiel se lit de part et d'autre de zéro : barre centrée.
  const centered = mode === 'diff';
  const positive = v >= 0;
  const barColor = centered ? (positive ? C.green : C.red) : mode === 'defense' ? C.teal : C.accent;
  const barWidth = `${(centered ? ratio * 50 : ratio * 100).toFixed(1)}%` as `${number}%`;

  return (
    <Pressable onPress={() => router.push(`/team/${row.team_id}`)}>
      <View style={{ paddingVertical: 11, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
        <Row style={{ gap: 10 }}>
          <Text style={{ color: rank <= 3 ? C.accent : C.dim, fontSize: 13, fontWeight: '600', width: 18 }}>
            {rank}
          </Text>
          <Crest
            label={teamShort({ short_name: row.short_name, name: row.team_name })}
            color={row.color ?? C.surface2}
            size={28}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>
              {row.team_name}
            </Text>
            <Text style={{ color: C.dim, fontSize: 11 }}>
              {t('{n} matchs', { n: row.games })} · {t('{v} V · {d} D', { v: row.wins, d: row.losses })}
              {mode === 'attaque' ? ` · ${t('record {n} pts', { n: row.best_score })}` : ''}
            </Text>
          </View>
          <Text style={{ color: centered && !positive ? C.red : C.text, fontSize: 15, fontWeight: '600' }}>
            {centered && positive ? '+' : ''}
            {v}
          </Text>
        </Row>

        <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: R.pill, overflow: 'hidden' }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              backgroundColor: barColor,
              borderRadius: R.pill,
              width: barWidth,
              ...(centered
                ? positive
                  ? { left: '50%' }
                  : { right: '50%' }
                : { left: 0 }),
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

function value(r: TeamSeasonStat, mode: Mode) {
  return mode === 'attaque' ? r.pts_for : mode === 'defense' ? r.pts_against : r.diff;
}

// En défense, le meilleur bilan est le plus petit nombre : tri croissant.
function sortBy(rows: TeamSeasonStat[], mode: Mode) {
  return [...rows].sort((a, b) =>
    mode === 'defense' ? value(a, mode) - value(b, mode) : value(b, mode) - value(a, mode),
  );
}
