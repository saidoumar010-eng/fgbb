import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listTeamSeasonStats } from '@/lib/db-stats';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { TeamSeasonStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const COLOR_A = C.accent;
const COLOR_B = C.flagYellow;

// Comparateur : deux équipes face à face, bilan par bilan (moyennes de la saison).
// Pendant du comparateur de joueurs, appuyé sur la même vue `team_season_stats`.
export default function CompareTeamsScreen() {
  const { t } = useT();
  const { a } = useLocalSearchParams<{ a?: string }>();
  const teams = useFetch(() => listTeamSeasonStats());
  const [idA, setIdA] = useState<string | null>(a ?? null);
  const [idB, setIdB] = useState<string | null>(null);
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map((teams.data ?? []).map((r) => [r.team_id, r])), [teams.data]);
  const tA = idA ? byId.get(idA) : undefined;
  const tB = idB ? byId.get(idB) : undefined;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (teams.data ?? [])
      .filter((r) => r.team_id !== idA && r.team_id !== idB)
      .filter((r) => (q ? r.team_name.toLowerCase().includes(q) : true))
      .sort((x, y) => x.team_name.localeCompare(y.team_name))
      .slice(0, 30);
  }, [teams.data, query, idA, idB]);

  function pick(r: TeamSeasonStat) {
    if (picking === 'A') setIdA(r.team_id);
    else setIdB(r.team_id);
    setPicking(null);
    setQuery('');
  }

  return (
    <Screen>
      <Header
        title={t('Comparateur d’équipes')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Row style={{ gap: 10, alignItems: 'stretch' }}>
          <TeamSlot
            team={tA}
            color={COLOR_A}
            onPress={() => setPicking(picking === 'A' ? null : 'A')}
            picking={picking === 'A'}
          />
          <View style={{ justifyContent: 'center' }}>
            <Text style={{ color: C.dim, fontSize: 13, fontWeight: '700' }}>VS</Text>
          </View>
          <TeamSlot
            team={tB}
            color={COLOR_B}
            onPress={() => setPicking(picking === 'B' ? null : 'B')}
            picking={picking === 'B'}
          />
        </Row>

        {picking && (
          <Card>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              {t('Choisir l’équipe {slot}', { slot: picking })}
            </Text>
            <TextInput
              placeholder={t('Rechercher une équipe…')}
              placeholderTextColor={C.dim}
              value={query}
              onChangeText={setQuery}
              style={{
                backgroundColor: C.inputBg,
                borderWidth: 1,
                borderColor: C.borderStrong,
                borderRadius: R.sm,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: C.text,
                fontSize: 14,
                marginBottom: 8,
              }}
            />
            {candidates.length === 0 ? (
              <Text style={{ color: C.dim, fontSize: 12.5, paddingVertical: 8 }}>
                {teams.loading ? t('Chargement…') : t('Aucune équipe trouvée.')}
              </Text>
            ) : (
              candidates.map((r, i) => (
                <Pressable key={r.team_id} onPress={() => pick(r)}>
                  <Row
                    style={{
                      paddingVertical: 9,
                      gap: 10,
                      borderBottomWidth: i < candidates.length - 1 ? 1 : 0,
                      borderBottomColor: C.border,
                    }}>
                    <Crest
                      label={teamShort({ short_name: r.short_name, name: r.team_name })}
                      size={26}
                      color={r.color ?? C.surface2}
                    />
                    <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                      {r.team_name}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 11.5 }}>
                      {t('{n} matchs', { n: r.games })}
                    </Text>
                  </Row>
                </Pressable>
              ))
            )}
          </Card>
        )}

        {tA && tB ? (
          <CompareTable a={tA} b={tB} />
        ) : (
          <Empty
            icon="git-compare-outline"
            title={t('Choisis deux équipes')}
            subtitle={t('Sélectionne une équipe de chaque côté pour comparer leurs bilans de la saison.')}
          />
        )}
      </View>
    </Screen>
  );
}

function TeamSlot({
  team,
  color,
  onPress,
  picking,
}: {
  team?: TeamSeasonStat;
  color: string;
  onPress: () => void;
  picking: boolean;
}) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card
        style={{
          alignItems: 'center',
          gap: 7,
          paddingVertical: 14,
          borderColor: picking ? color : C.border,
          borderWidth: 1,
        }}>
        {team ? (
          <Crest
            label={teamShort({ short_name: team.short_name, name: team.team_name })}
            size={54}
            color={team.color ?? C.surface2}
          />
        ) : (
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: R.md,
              backgroundColor: C.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="add" size={24} color={color} />
          </View>
        )}
        <Text
          style={{ color: team ? C.text : color, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}
          numberOfLines={2}>
          {team ? team.team_name : t('Choisir une équipe')}
        </Text>
        {team ? (
          <Text style={{ color: C.dim, fontSize: 11 }}>
            {t('{v} V · {d} D', { v: team.wins, d: team.losses })}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

// Chaque bilan sait s'il se lit « plus haut = mieux » (points marqués) ou
// l'inverse (points encaissés). La barre représente toujours l'avantage, pour
// que la lecture reste « la plus longue est la meilleure » comme chez les joueurs.
interface Metric {
  label: string;
  get: (r: TeamSeasonStat) => number;
  lowerBetter?: boolean;
  signed?: boolean;
  pct?: boolean;
  decimal?: boolean;
  neutral?: boolean; // ni gagnant ni perdant (ex. matchs joués)
}

const METRICS: Metric[] = [
  { label: 'Victoires', get: (r) => r.wins },
  { label: 'Pourcentage de victoires', get: (r) => (r.games ? (100 * r.wins) / r.games : 0), pct: true },
  { label: 'Points marqués / match', get: (r) => r.pts_for, decimal: true },
  { label: 'Points encaissés / match', get: (r) => r.pts_against, lowerBetter: true, decimal: true },
  { label: 'Différentiel / match', get: (r) => r.diff, signed: true, decimal: true },
  { label: 'Record de points', get: (r) => r.best_score },
  { label: 'Matchs joués', get: (r) => r.games, neutral: true },
];

function CompareTable({ a, b }: { a: TeamSeasonStat; b: TeamSeasonStat }) {
  const { t } = useT();
  if (a.games === 0 && b.games === 0) {
    return (
      <Card>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          {t('Aucune statistique enregistrée pour ces équipes cette saison.')}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      {METRICS.map((m) => {
        const va = m.get(a);
        const vb = m.get(b);
        const fmt = (v: number) =>
          m.pct
            ? `${Math.round(v)}%`
            : m.signed
              ? `${v >= 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}`
              : m.decimal && !Number.isInteger(v)
                ? v.toFixed(1)
                : `${v}`;

        // « Avantage » : transforme la valeur pour que plus grand = mieux, même
        // en défense. La barre est ensuite proportionnelle à cet avantage.
        const goodA = m.neutral ? va : m.lowerBetter ? Math.max(va, vb) - va : va;
        const goodB = m.neutral ? vb : m.lowerBetter ? Math.max(va, vb) - vb : vb;
        const max = Math.max(Math.abs(goodA), Math.abs(goodB), 0.001);

        const aWins = !m.neutral && (m.lowerBetter ? va < vb : va > vb);
        const bWins = !m.neutral && (m.lowerBetter ? vb < va : vb > va);

        return (
          <View key={m.label}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <Text
                style={{ color: aWins ? C.text : C.muted, fontSize: 13, fontWeight: aWins ? '700' : '400', width: 60 }}>
                {fmt(va)}
              </Text>
              <Text style={{ color: C.dim, fontSize: 11.5, flex: 1, textAlign: 'center' }}>{t(m.label)}</Text>
              <Text
                style={{
                  color: bWins ? C.text : C.muted,
                  fontSize: 13,
                  fontWeight: bWins ? '700' : '400',
                  width: 60,
                  textAlign: 'right',
                }}>
                {fmt(vb)}
              </Text>
            </Row>
            <Row style={{ gap: 6 }}>
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.surface2, alignItems: 'flex-end' }}>
                <View
                  style={{
                    width: `${Math.max((100 * Math.abs(goodA)) / max, 2)}%`,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: COLOR_A,
                  }}
                />
              </View>
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.surface2 }}>
                <View
                  style={{
                    width: `${Math.max((100 * Math.abs(goodB)) / max, 2)}%`,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: COLOR_B,
                  }}
                />
              </View>
            </Row>
          </View>
        );
      })}
    </Card>
  );
}
