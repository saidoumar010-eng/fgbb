import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { Card, Empty, Header, Logo, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { listMatches, listNews } from '@/lib/db';
import { fullDate } from '@/lib/format';
import { useMatchesRealtime } from '@/lib/realtime';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function HomeScreen() {
  const matches = useFetch(() => listMatches());
  const news = useFetch(() => listNews());
  useMatchesRealtime(() => matches.reload());
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([matches.reload(), news.reload()]);
    setRefreshing(false);
  };

  const all = matches.data ?? [];
  const live = all.filter((m) => m.status === 'live');
  const upcoming = all.filter((m) => m.status === 'scheduled').slice(0, 4);
  const latestNews = (news.data ?? []).slice(0, 3);
  const nothing = all.length === 0 && latestNews.length === 0 && !matches.loading;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        left={
          <Row style={{ gap: 9 }}>
            <Logo />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: 0.4 }}>
              FGBB
            </Text>
          </Row>
        }
        right={
          <Row style={{ gap: 16 }}>
            <Ionicons name="search-outline" size={22} color={C.muted} onPress={() => router.push('/search')} />
            <Ionicons name="notifications-outline" size={22} color={C.muted} />
          </Row>
        }
      />

      {nothing ? (
        <Empty
          icon="basketball-outline"
          title="Bienvenue sur l'app FGBB"
          subtitle="Aucun contenu pour le moment. Connecte-toi à l'espace fédération pour ajouter des équipes, des matchs et des actualités."
        />
      ) : (
        <View style={{ paddingTop: S.md }}>
          {live.length > 0 && (
            <>
              <SectionTitle title="En direct" />
              <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
                {live.map((m) => (
                  <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
                ))}
              </View>
            </>
          )}

          <SectionTitle title="Prochains matchs" />
          <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
            {upcoming.length > 0 ? (
              upcoming.map((m) => (
                <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
              ))
            ) : (
              <Card>
                <Text style={{ color: C.dim, fontSize: 13 }}>Aucun match programmé.</Text>
              </Card>
            )}
          </View>

          <SectionTitle title="Actualités" />
          <View style={{ paddingHorizontal: S.lg, gap: 11 }}>
            {latestNews.length > 0 ? (
              latestNews.map((n) => (
                <Pressable key={n.id} onPress={() => router.push(`/article/${n.id}`)}>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {n.cover_url ? (
                    <Image source={{ uri: n.cover_url }} style={{ height: 110 }} contentFit="cover" />
                  ) : (
                    <View
                      style={{
                        height: 110,
                        backgroundColor: '#1A2433',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Ionicons name="image-outline" size={28} color="#3B5168" />
                    </View>
                  )}
                  <View style={{ padding: 12, gap: 7 }}>
                    {n.category ? <Pill label={n.category.toUpperCase()} tone="green" /> : null}
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>
                      {n.title}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 11 }}>{fullDate(n.published_at)}</Text>
                  </View>
                </Card>
                </Pressable>
              ))
            ) : (
              <Card>
                <Text style={{ color: C.dim, fontSize: 13 }}>Pas encore d'actualité.</Text>
              </Card>
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}
