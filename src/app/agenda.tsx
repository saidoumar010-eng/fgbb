import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { eventCategoryLabel, listEvents } from '@/lib/db-content';
import { matchWhen } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { FedEvent } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Affichage en UTC comme le reste de l'app (la Guinée est à GMT).
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

interface MonthGroup {
  key: string;
  month: number;
  year: number;
  items: FedEvent[];
}

export default function AgendaScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listEvents(), [], { cacheKey: 'events' });
  const [showPast, setShowPast] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => data ?? [], [data]);

  // Un événement reste « à venir » jusqu'à sa date de fin : une formation de
  // trois jours ne doit pas basculer dans les archives dès le premier soir.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const over = (e: FedEvent) => new Date(e.ends_at ?? e.starts_at).getTime() < now;
    return {
      upcoming: all.filter((e) => !over(e)),
      past: all.filter(over).reverse(), // les plus récents d'abord
    };
  }, [all]);

  const months = useMemo(() => groupByMonth(upcoming), [upcoming]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Agenda')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {all.length === 0 ? (
        <Empty
          icon="calendar-outline"
          title={loading ? t('Chargement…') : t('Aucun événement')}
          subtitle={loading ? undefined : t('Les rendez-vous de la fédération apparaîtront ici.')}
        />
      ) : (
        <View style={{ paddingBottom: S.lg }}>
          {months.length === 0 ? (
            <Text style={{ color: C.dim, fontSize: 13, padding: S.lg }}>
              {t('Aucun événement à venir pour le moment.')}
            </Text>
          ) : (
            months.map((g) => (
              <View key={g.key}>
                <Text
                  style={{
                    color: C.accent,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    marginHorizontal: S.lg,
                    marginTop: S.lg,
                    marginBottom: S.sm,
                  }}>
                  {`${t(MONTHS[g.month])} ${g.year}`}
                </Text>
                <View style={{ paddingHorizontal: S.lg, gap: 10 }}>
                  {g.items.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </View>
              </View>
            ))
          )}

          {past.length > 0 && (
            <View style={{ marginTop: S.xl, paddingHorizontal: S.lg }}>
              <Pressable
                onPress={() => setShowPast((v) => !v)}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
                <Card style={{ paddingVertical: 12 }}>
                  <Row style={{ gap: 10 }}>
                    <Ionicons name="time-outline" size={17} color={C.muted} />
                    <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>
                      {t('Événements passés ({n})', { n: past.length })}
                    </Text>
                    <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
                  </Row>
                </Card>
              </Pressable>

              {showPast && (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {past.map((e) => (
                    <EventRow key={e.id} event={e} past />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

function EventRow({ event: e, past }: { event: FedEvent; past?: boolean }) {
  const { t } = useT();
  const d = new Date(e.starts_at);
  const { time } = matchWhen(e.starts_at);
  const multiDay = !!e.ends_at && new Date(e.ends_at).getUTCDate() !== d.getUTCDate();

  return (
    <Card style={{ opacity: past ? 0.65 : 1 }}>
      <Row style={{ gap: 14, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 50,
            paddingVertical: 8,
            borderRadius: R.md,
            backgroundColor: past ? C.surface2 : C.accentSoft,
            alignItems: 'center',
          }}>
          <Text style={{ color: past ? C.muted : C.accent, fontSize: 22, fontWeight: '700' }}>
            {d.getUTCDate()}
          </Text>
          <Text style={{ color: past ? C.dim : C.accent, fontSize: 10.5, fontWeight: '600' }}>
            {t(DAYS[d.getUTCDay()])}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{e.title}</Text>
          {e.location ? (
            <Row style={{ gap: 5 }}>
              <Ionicons name="location-outline" size={12.5} color={C.dim} />
              <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                {e.location}
              </Text>
            </Row>
          ) : null}
          {e.description ? (
            <Text style={{ color: C.dim, fontSize: 12.5, lineHeight: 18 }} numberOfLines={3}>
              {e.description}
            </Text>
          ) : null}
          <Row style={{ gap: 8, marginTop: 2 }}>
            <Pill label={t(eventCategoryLabel(e.category))} tone={past ? 'neutral' : 'accent'} />
            <Text style={{ color: C.dim, fontSize: 11.5 }}>
              {multiDay ? t('Jusqu’au {date}', { date: dayMonth(e.ends_at, t) }) : time}
            </Text>
          </Row>
        </View>
      </Row>
    </Card>
  );
}

function groupByMonth(events: FedEvent[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const e of events) {
    const d = new Date(e.starts_at);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const last = groups[groups.length - 1];
    // La liste arrive déjà triée par date : comparer au dernier groupe suffit.
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, month: d.getUTCMonth(), year: d.getUTCFullYear(), items: [e] });
  }
  return groups;
}

function dayMonth(iso: string | null, t: (fr: string) => string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${t(MONTHS[d.getUTCMonth()]).toLowerCase()}`;
}
