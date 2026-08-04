import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { Card, Row, SectionTitle } from '@/components/ui';
import { getClubDashboard } from '@/lib/db-club-space';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Vue d'ensemble du club pour son dirigeant : place au classement, meilleur
 * marqueur, prochain match et dernier résultat. Uniquement des données
 * publiques regroupées — la valeur est dans le rassemblement, pas dans un accès
 * particulier.
 */
export function ClubDashboard({ teamId }: { teamId: string }) {
  const { t } = useT();
  const { data, loading } = useFetch(() => getClubDashboard(teamId), [teamId]);

  const rankLabel =
    data?.rank == null ? '—' : data.rank === 1 ? t('1er') : t('{n}e', { n: data.rank });
  const record = data?.standing
    ? `${t('{v} V · {d} D', { v: data.standing.wins, d: data.standing.losses })} · ${t('{n} pts', {
        n: data.standing.points,
      })}`
    : loading
      ? t('Chargement…')
      : t('Pas encore classé');
  const scorer = data?.topScorer;

  // Dans le corps du composant : relu à chaque thème (cf. classement.tsx).
  const label = { color: C.dim, fontSize: 11, fontWeight: '600' as const, marginTop: 2 };

  return (
    <>
      <SectionTitle title={t('Tableau de bord')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        <Row style={{ gap: 9, alignItems: 'stretch' }}>
          <Tile label={t('Classement')} value={rankLabel} sub={record} />
          <Tile
            label={t('Meilleur marqueur')}
            value={scorer ? `${scorer.ppg.toFixed(1)}` : '—'}
            sub={scorer ? scorer.full_name : loading ? t('Chargement…') : t('Aucune statistique')}
            valueSuffix={scorer ? t('pts/m') : undefined}
            onPress={scorer ? () => router.push(`/player/${scorer.player_id}`) : undefined}
          />
        </Row>

        {data?.nextMatch ? (
          <View style={{ gap: 6 }}>
            <Text style={label}>{t('Prochain match')}</Text>
            <MatchRow match={data.nextMatch} onPress={() => router.push(`/match/${data.nextMatch!.id}`)} />
          </View>
        ) : null}

        {data?.lastMatch ? (
          <View style={{ gap: 6 }}>
            <Text style={label}>{t('Dernier résultat')}</Text>
            <MatchRow match={data.lastMatch} onPress={() => router.push(`/match/${data.lastMatch!.id}`)} />
          </View>
        ) : null}
      </View>
    </>
  );
}

function Tile({
  label: title,
  value,
  valueSuffix,
  sub,
  onPress,
}: {
  label: string;
  value: string;
  valueSuffix?: string;
  sub: string;
  onPress?: () => void;
}) {
  const inner = (
    <Card style={{ flex: 1, gap: 3, paddingVertical: 12 }}>
      <Text style={{ color: C.dim, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
        {title}
      </Text>
      <Row style={{ alignItems: 'baseline', gap: 4 }}>
        <Text style={{ color: C.accent, fontSize: 22, fontWeight: '700' }}>{value}</Text>
        {valueSuffix ? <Text style={{ color: C.dim, fontSize: 11 }}>{valueSuffix}</Text> : null}
      </Row>
      <Text style={{ color: C.muted, fontSize: 11.5 }} numberOfLines={1}>
        {sub}
      </Text>
    </Card>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
      {inner}
    </Pressable>
  );
}
