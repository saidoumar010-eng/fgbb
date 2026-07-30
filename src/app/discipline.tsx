import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import {
  formatGnf,
  listSanctions,
  SANCTION_KINDS,
  sanctionKindLabel,
  sanctionStatusLabel,
} from '@/lib/db-officials';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Sanction, SanctionKind } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const KIND_ICONS: Record<SanctionKind, keyof typeof Ionicons.glyphMap> = {
  avertissement: 'warning-outline',
  suspension: 'time-outline',
  amende: 'cash-outline',
  exclusion: 'close-circle-outline',
};

// Décisions disciplinaires publiées par la fédération : les plus récentes
// d'abord. Le motif est celui rédigé par la commission de discipline.
export default function DisciplineScreen() {
  const { t } = useT();
  const [kind, setKind] = useState<SanctionKind | 'all'>('all');
  const { data, loading, reload } = useFetch(
    () => listSanctions(kind === 'all' ? {} : { kind }),
    [kind],
  );
  const sanctions = data ?? [];

  const filters: { id: SanctionKind | 'all'; label: string }[] = [
    { id: 'all', label: 'Toutes' },
    ...SANCTION_KINDS,
  ];

  function detail(s: Sanction) {
    if (s.kind === 'amende' && s.amount_gnf > 0) return formatGnf(s.amount_gnf);
    if (s.kind === 'suspension' && s.games > 0) return t('{n} match(s)', { n: s.games });
    return '';
  }

  return (
    <Screen scroll={false}>
      <Header
        title={t('Discipline')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingVertical: S.md }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, gap: 8 }}>
          {filters.map((f) => {
            const on = kind === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setKind(f.id)}
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

      {sanctions.length === 0 ? (
        <Empty
          icon="shield-checkmark-outline"
          title={loading ? t('Chargement…') : t('Aucune décision')}
          subtitle={loading ? undefined : t('Aucune décision disciplinaire publiée pour le moment.')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.xl * 2, gap: 9 }}
          showsVerticalScrollIndicator={false}>
          {sanctions.map((s) => {
            const extra = detail(s);
            const isTeam = !s.player_id && !!s.team;
            return (
              <Card key={s.id}>
                <Row style={{ gap: 12 }}>
                  <Crest
                    label={isTeam ? teamShort(s.team) : (s.player?.full_name ?? '?').slice(0, 2).toUpperCase()}
                    color={isTeam ? (s.team?.color ?? C.surface2) : C.surface2}
                    size={38}
                    round={!isTeam}
                    image={isTeam ? s.team?.logo_url : s.player?.photo_url}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                      {s.player?.full_name ?? s.team?.name ?? '—'}
                    </Text>
                    <Row style={{ gap: 6, marginTop: 4 }}>
                      <Ionicons name={KIND_ICONS[s.kind]} size={14} color={C.muted} />
                      <Text style={{ color: C.muted, fontSize: 12 }}>
                        {t(sanctionKindLabel(s.kind))}
                        {extra ? ` · ${extra}` : ''}
                      </Text>
                    </Row>
                  </View>
                  <Pill
                    label={t(sanctionStatusLabel(s.status))}
                    tone={s.status === 'active' ? 'red' : s.status === 'served' ? 'green' : 'neutral'}
                  />
                </Row>
                {s.reason ? (
                  <Text style={{ color: C.muted, fontSize: 13, marginTop: 10, lineHeight: 19 }}>{s.reason}</Text>
                ) : null}
                <Text style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>
                  {t('Décision du {date}', { date: fullDate(s.decided_at) })}
                </Text>
              </Card>
            );
          })}
          <Pressable onPress={reload} style={{ paddingVertical: S.md, alignItems: 'center' }}>
            <Text style={{ color: C.accent, fontSize: 13 }}>{t('Actualiser')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}
