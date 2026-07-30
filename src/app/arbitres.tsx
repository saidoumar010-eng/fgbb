import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listReferees, REFEREE_LEVELS, refereeLevelLabel } from '@/lib/db-officials';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { RefereeLevel } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Annuaire public : uniquement les informations sportives. Les coordonnées
// personnelles vivent dans une table réservée à la fédération.
export default function RefereesDirectory() {
  const { t } = useT();
  const [level, setLevel] = useState<RefereeLevel | 'all'>('all');
  const { data, loading } = useFetch(() => listReferees(true));
  const all = data ?? [];
  const referees = level === 'all' ? all : all.filter((r) => r.level === level);

  const filters: { id: RefereeLevel | 'all'; label: string }[] = [
    { id: 'all', label: 'Tous' },
    ...REFEREE_LEVELS,
  ];

  return (
    <Screen scroll={false}>
      <Header
        title={t('Arbitres')}
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
            const on = level === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setLevel(f.id)}
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

      {referees.length === 0 ? (
        <Empty
          icon="person-outline"
          title={loading ? t('Chargement…') : t('Aucun arbitre')}
          subtitle={loading ? undefined : t('Le corps arbitral sera publié prochainement.')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.xl * 2 }}
          showsVerticalScrollIndicator={false}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {referees.map((r, i) => (
              <Row
                key={r.id}
                style={{
                  paddingVertical: 11,
                  gap: 12,
                  borderBottomWidth: i < referees.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                <Crest
                  label={r.full_name.slice(0, 2).toUpperCase()}
                  color={C.surface2}
                  size={38}
                  round
                  image={r.photo_url}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>{r.full_name}</Text>
                  <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{r.city ?? '—'}</Text>
                </View>
                <View
                  style={{
                    backgroundColor: C.accentSoft,
                    borderRadius: R.pill,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                  }}>
                  <Text style={{ color: C.accent, fontSize: 11, fontWeight: '600' }}>
                    {t(refereeLevelLabel(r.level))}
                  </Text>
                </View>
              </Row>
            ))}
          </Card>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: S.md, textAlign: 'center' }}>
            {t('{n} arbitres en activité', { n: referees.length })}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}
