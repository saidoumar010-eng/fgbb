import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { SponsorBand } from '@/components/sponsor-band';
import { Card, Crest, Empty, Header, Logo, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { listMatches, listNews } from '@/lib/db';
import { fullDate, matchWhen, teamShort } from '@/lib/format';
import { useMatchesRealtime } from '@/lib/realtime';
import { C, R, S } from '@/lib/theme';
import type { Match } from '@/lib/types';
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
  const upcoming = all.filter((m) => m.status === 'scheduled');
  const finished = all.filter((m) => m.status === 'finished').reverse();
  const latestNews = (news.data ?? []).slice(0, 6);

  // Match « à la une » : en direct en priorité, sinon le prochain, sinon le dernier résultat.
  const featured: Match | undefined = live[0] ?? upcoming[0] ?? finished[0];
  const otherLive = live.filter((m) => m.id !== featured?.id);
  const nextMatches = upcoming.filter((m) => m.id !== featured?.id).slice(0, 4);
  const lastResults = finished.filter((m) => m.id !== featured?.id).slice(0, 3);

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
            <Ionicons name="notifications-outline" size={22} color={C.muted} onPress={() => router.push('/compte')} />
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
          {featured && (
            <View style={{ paddingHorizontal: S.lg }}>
              <FeaturedMatch match={featured} />
            </View>
          )}

          <Row style={{ paddingHorizontal: S.lg, gap: 9, marginTop: S.md }}>
            <QuickLink icon="videocam-outline" label="Vidéos" href="/videos" />
            <QuickLink icon="podium-outline" label="Leaders" href="/leaders" />
            <QuickLink icon="heart-outline" label="Fan zone" href="/fanzone" />
            <QuickLink icon="git-compare-outline" label="Comparer" href="/compare" />
          </Row>
          <Row style={{ paddingHorizontal: S.lg, gap: 9, marginTop: 9 }}>
            <QuickLink icon="images-outline" label="Photos" href="/galerie" />
            <QuickLink icon="calendar-outline" label="Agenda" href="/agenda" />
            <QuickLink icon="mic-outline" label="Médias" href="/medias" />
            <QuickLink icon="information-circle-outline" label="À propos" href="/apropos" />
          </Row>

          {otherLive.length > 0 && (
            <>
              <SectionTitle title="Aussi en direct" />
              <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
                {otherLive.map((m) => (
                  <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
                ))}
              </View>
            </>
          )}

          <SectionTitle
            title="Prochains matchs"
            action={
              <Pressable onPress={() => router.push('/matchs')}>
                <Text style={{ color: C.accent, fontSize: 12 }}>Tout voir</Text>
              </Pressable>
            }
          />
          <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
            {nextMatches.length > 0 ? (
              nextMatches.map((m) => (
                <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
              ))
            ) : (
              <Card>
                <Text style={{ color: C.dim, fontSize: 13 }}>Aucun match programmé.</Text>
              </Card>
            )}
          </View>

          {latestNews.length > 0 && (
            <>
              <SectionTitle
                title="Actualités"
                action={
                  <Pressable onPress={() => router.push('/actus')}>
                    <Text style={{ color: C.accent, fontSize: 12 }}>Tout voir</Text>
                  </Pressable>
                }
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: S.lg, gap: 11 }}>
                {latestNews.map((n) => (
                  <Pressable key={n.id} onPress={() => router.push(`/article/${n.id}`)}>
                    <Card style={{ padding: 0, overflow: 'hidden', width: 240 }}>
                      {n.cover_url ? (
                        <Image source={{ uri: n.cover_url }} style={{ height: 120 }} contentFit="cover" />
                      ) : (
                        <View
                          style={{
                            height: 120,
                            backgroundColor: C.surface2,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          <Ionicons name="image-outline" size={28} color={C.dim} />
                        </View>
                      )}
                      <View style={{ padding: 12, gap: 6 }}>
                        {n.category ? <Pill label={n.category.toUpperCase()} tone="green" /> : null}
                        <Text
                          style={{ color: C.text, fontSize: 13.5, fontWeight: '600', lineHeight: 19, minHeight: 38 }}
                          numberOfLines={2}>
                          {n.title}
                        </Text>
                        <Text style={{ color: C.dim, fontSize: 11 }}>{fullDate(n.published_at)}</Text>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {lastResults.length > 0 && (
            <>
              <SectionTitle title="Derniers résultats" />
              <View style={{ paddingHorizontal: S.lg, gap: 9, marginBottom: S.md }}>
                {lastResults.map((m) => (
                  <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
                ))}
              </View>
            </>
          )}

          <SponsorBand placement="accueil" />
        </View>
      )}
    </Screen>
  );
}

// Grande carte « à la une », inspirée des affiches de la fédération (vert canard).
function FeaturedMatch({ match: m }: { match: Match }) {
  const scheduled = m.status === 'scheduled';
  const live = m.status === 'live';
  const { day, time } = matchWhen(m.scheduled_at);

  return (
    <Pressable onPress={() => router.push(`/match/${m.id}`)} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
      <View
        style={{
          backgroundColor: C.teal,
          borderRadius: R.xl,
          padding: S.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.09)',
        }}>
        <Ionicons
          name="basketball"
          size={150}
          color="rgba(255,255,255,0.06)"
          style={{ position: 'absolute', right: -34, top: -26 }}
        />

        <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', letterSpacing: 0.6 }}>
            {(m.competition?.name ?? 'À LA UNE').toUpperCase()}
          </Text>
          {live ? (
            <Pill label="DIRECT" tone="red" dot />
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
              {scheduled ? `${day} ${fullDate(m.scheduled_at)}` : 'Résultat'}
            </Text>
          )}
        </Row>

        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 7 }}>
            <Crest label={teamShort(m.home_team)} color={m.home_team?.color ?? C.tealDeep} size={46} image={m.home_team?.logo_url} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
              {m.home_team?.name ?? 'Équipe'}
            </Text>
          </View>

          <View style={{ alignItems: 'center', paddingHorizontal: 10 }}>
            {scheduled ? (
              <>
                <Text style={{ color: C.accent, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {time || 'vs'}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
                  {m.venue ?? 'Coup d’envoi'}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {m.home_score} – {m.away_score}
                </Text>
                {live && m.current_quarter ? (
                  <Text style={{ color: C.accent, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                    {m.current_quarter <= 4 ? `Q${m.current_quarter}` : `Prol. ${m.current_quarter - 4}`}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <View style={{ flex: 1, alignItems: 'center', gap: 7 }}>
            <Crest label={teamShort(m.away_team)} color={m.away_team?.color ?? C.tealDeep} size={46} image={m.away_team?.logo_url} />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
              {m.away_team?.name ?? 'Équipe'}
            </Text>
          </View>
        </Row>

        <Row style={{ justifyContent: 'center', marginTop: 14, gap: 5 }}>
          <Text style={{ color: C.accent, fontSize: 12.5, fontWeight: '600' }}>
            {live ? 'Suivre le direct' : scheduled ? 'Voir le match' : 'Voir le résumé'}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={C.accent} />
        </Row>
      </View>
    </Pressable>
  );
}

function QuickLink({
  icon,
  label,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
}) {
  return (
    <Pressable onPress={() => router.push(href as never)} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
      <Card style={{ alignItems: 'center', paddingVertical: 12, gap: 6 }}>
        <Ionicons name={icon} size={19} color={C.accent} />
        <Text style={{ color: C.muted, fontSize: 10.5, fontWeight: '600' }}>{label}</Text>
      </Card>
    </Pressable>
  );
}
