import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { eventCategoryLabel, listEvents } from '@/lib/db-content';
import { fullDate, matchWhen } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminEvents() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listEvents());
  const events = data ?? [];
  const now = Date.now();

  // Le formulaire est un écran empilé : on rafraîchit au retour.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <Screen>
      <Header
        title={t('Agenda')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/event-form' as never)}>
            <Ionicons name="add" size={26} color={C.accent} />
          </Pressable>
        }
      />

      {events.length === 0 ? (
        <Empty
          icon="calendar-outline"
          title={loading ? t('Chargement…') : t('Aucun événement')}
          subtitle={t('Crée les rendez-vous de la fédération : assemblées, tournois, formations.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {events.map((e) => {
            const past = new Date(e.ends_at ?? e.starts_at).getTime() < now;
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/admin/event-form?id=${e.id}` as never)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                <Card style={{ opacity: past ? 0.6 : 1 }}>
                  <Row style={{ gap: 12 }}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{e.title}</Text>
                      <Text style={{ color: C.dim, fontSize: 12 }}>
                        {[fullDate(e.starts_at), matchWhen(e.starts_at).time, e.location]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      <Row style={{ gap: 8, marginTop: 2 }}>
                        <Pill label={t(eventCategoryLabel(e.category))} tone={past ? 'neutral' : 'accent'} />
                        {past ? <Pill label={t('Passé')} tone="neutral" /> : null}
                      </Row>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.dim} />
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
