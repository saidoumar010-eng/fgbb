import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listSeasons } from '@/lib/db-federation';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminSeasons() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listSeasons());
  const seasons = data ?? [];

  // Le formulaire est un écran empilé : on rafraîchit au retour pour refléter
  // la création ou le changement de saison en cours.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <Screen>
      <Header
        title={t('Saisons')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/season-form' as never)}>
            <Ionicons name="add" size={26} color={C.accent} />
          </Pressable>
        }
      />

      {seasons.length === 0 ? (
        <Empty
          icon="calendar-outline"
          title={loading ? t('Chargement…') : t('Aucune saison')}
          subtitle={t('Crée une saison pour y rattacher les compétitions, les licences et les transferts.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {seasons.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/admin/season-form?id=${s.id}` as never)}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
              <Card>
                <Row style={{ gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row style={{ gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
                      {s.is_current ? <Pill label={t('En cours')} tone="accent" dot /> : null}
                    </Row>
                    <Text style={{ color: C.dim, fontSize: 12 }}>
                      {s.start_date || s.end_date
                        ? `${fullDate(s.start_date) || '—'} → ${fullDate(s.end_date) || '—'}`
                        : t('Dates non renseignées')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.dim} />
                </Row>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
