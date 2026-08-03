import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, OfflineNotice, Row, Screen, SectionTitle } from '@/components/ui';
import { listCompetitions, listLeaders, listStandings } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Raccourcis vers les écrans de données : le classement est la porte d'entrée
// naturelle de tout ce qui est chiffré dans l'application.
const DATA_LINKS: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { icon: 'flame-outline', label: 'Leaders', href: '/leaders' },
  { icon: 'trophy-outline', label: 'Records', href: '/records' },
  { icon: 'bar-chart-outline', label: 'Stats équipes', href: '/stats-equipes' },
  { icon: 'git-compare-outline', label: 'Comparer', href: '/compare' },
  { icon: 'people-outline', label: 'Comparer équipes', href: '/compare-equipes' },
  { icon: 'warning-outline', label: 'Discipline', href: '/discipline' },
  { icon: 'people-circle-outline', label: 'Arbitres', href: '/arbitres' },
];

export default function ClassementScreen() {
  const { t } = useT();
  const comps = useFetch(() => listCompetitions(), [], { cacheKey: 'competitions' });
  const [compId, setCompId] = useState<string | undefined>();
  const active = compId ?? comps.data?.[0]?.id;
  const standings = useFetch(() => listStandings(active), [active], { cacheKey: `standings:${active ?? 'all'}` });
  const leaders = useFetch(() => listLeaders(), [], { cacheKey: 'leaders' });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([comps.reload(), standings.reload(), leaders.reload()]);
    setRefreshing(false);
  };

  const rows = standings.data ?? [];
  const top = leaders.data ?? [];
  const competitions = comps.data ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Classement')}
        right={
          <Pressable onPress={() => router.push('/leaders')}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '500' }}>{t('Leaders')}</Text>
          </Pressable>
        }
      />

      {standings.stale && <OfflineNotice cachedAt={standings.cachedAt} onRetry={standings.reload} />}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.md, gap: 8 }}>
        {DATA_LINKS.map((l) => (
          <Pressable key={l.href} onPress={() => router.push(l.href as never)}>
            <Card style={{ paddingVertical: 10, paddingHorizontal: 13, minWidth: 108 }}>
              <Ionicons name={l.icon} size={18} color={C.accent} />
              <Text style={{ color: C.text, fontSize: 12.5, marginTop: 6 }}>{t(l.label)}</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      {competitions.length > 0 && (
        <View style={{ paddingVertical: S.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: S.lg, gap: 8 }}>
            {competitions.map((c) => {
              const on = active === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCompId(c.id)}
                  style={{
                    backgroundColor: on ? C.accent : C.chipBg,
                    borderRadius: R.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}>
                  <Text style={{ color: on ? C.accentText : C.muted, fontSize: 12, fontWeight: '600' }}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {rows.length === 0 && top.length === 0 ? (
        <Empty
          icon="trophy-outline"
          title={t('Pas encore de classement')}
          subtitle={t(
            'Le classement se calcule automatiquement à partir des matchs terminés saisis par la fédération.',
          )}
        />
      ) : (
        <>
          {rows.length > 0 && (
            <View style={{ paddingHorizontal: S.lg }}>
              <Card style={{ paddingVertical: 6, paddingHorizontal: 11 }}>
                <Row style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={[hCell, { flex: 1, textAlign: 'left' }]}>{t('Équipe')}</Text>
                  <Text style={hCell}>{t('J')}</Text>
                  <Text style={hCell}>{t('V')}</Text>
                  <Text style={hCell}>{t('D')}</Text>
                  <Text style={[hCell, { color: C.text }]}>{t('Pts')}</Text>
                </Row>
                {rows.map((s, i) => (
                  <Pressable key={s.team_id} onPress={() => router.push(`/team/${s.team_id}`)}>
                  <Row
                    style={{ paddingVertical: 9, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                    <Row style={{ flex: 1, gap: 8 }}>
                      <Text style={{ color: C.dim, fontSize: 12, width: 16 }}>{i + 1}</Text>
                      <Crest label={(s.short_name ?? s.team_name).slice(0, 3).toUpperCase()} color={s.color ?? C.surface2} size={20} />
                      <Text style={{ color: C.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                        {s.team_name}
                      </Text>
                    </Row>
                    <Text style={cell}>{s.played}</Text>
                    <Text style={cell}>{s.wins}</Text>
                    <Text style={cell}>{s.losses}</Text>
                    <Text style={[cell, { color: '#fff', fontWeight: '600' }]}>{s.points}</Text>
                  </Row>
                  </Pressable>
                ))}
              </Card>
            </View>
          )}

          {top.length > 0 && (
            <>
              <SectionTitle title={t('Meilleurs marqueurs')} />
              <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
                {top.slice(0, 5).map((p) => (
                  <Pressable key={p.player_id} onPress={() => router.push(`/player/${p.player_id}`)}>
                    <Card>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }}>{p.full_name}</Text>
                        <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>{p.ppg} pts</Text>
                      </Row>
                    </Card>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const hCell = { color: C.dim, fontSize: 11, fontWeight: '600' as const, width: 30, textAlign: 'center' as const };
const cell = { color: C.muted, fontSize: 12, width: 30, textAlign: 'center' as const };
