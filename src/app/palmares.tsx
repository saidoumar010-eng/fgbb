import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { AWARD_KINDS, awardKindLabel, listAwards } from '@/lib/db-awards';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { Award } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Palmarès : les distinctions décernées par la fédération, groupées par type.
export default function PalmaresScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listAwards());
  const [refreshing, setRefreshing] = useState(false);

  const groups = useMemo(() => {
    const all = data ?? [];
    return AWARD_KINDS.map((k) => ({ kind: k, items: all.filter((a) => a.kind === k.id) })).filter(
      (g) => g.items.length > 0,
    );
  }, [data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Palmarès')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {groups.length === 0 ? (
        <Empty
          icon="trophy-outline"
          title={loading ? t('Chargement…') : t('Aucune distinction')}
          subtitle={loading ? undefined : t('Les récompenses décernées par la fédération apparaîtront ici.')}
        />
      ) : (
        groups.map((g) => (
          <View key={g.kind.id}>
            <SectionTitle title={t(g.kind.label)} />
            <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
              {g.items.map((a) => (
                <AwardCard key={a.id} award={a} />
              ))}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

function AwardCard({ award: a }: { award: Award }) {
  const { t } = useT();
  const team = a.team;
  return (
    <Pressable onPress={() => a.player_id && router.push(`/player/${a.player_id}`)} disabled={!a.player_id}>
      <Card>
        <Row style={{ gap: 12 }}>
          <Crest
            label={(a.player?.full_name ?? '—').slice(0, 2).toUpperCase()}
            color={team?.color ?? C.surface2}
            size={40}
            round
            image={a.player?.photo_url}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {a.player?.full_name ?? a.label ?? t('Distinction')}
            </Text>
            <Text style={{ color: C.dim, fontSize: 12 }} numberOfLines={1}>
              {[a.label && a.player ? a.label : null, team?.name].filter(Boolean).join(' · ') ||
                t(awardKindLabel(a.kind))}
            </Text>
            {a.note ? (
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                {a.note}
              </Text>
            ) : null}
          </View>
          <Ionicons name="trophy" size={18} color={C.flagYellow} />
        </Row>
      </Card>
    </Pressable>
  );
}
