import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Empty, Header, Row, Screen } from '@/components/ui';
import { listCompetitions, listVideos } from '@/lib/db';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Match } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';
import { videoThumbnail } from '@/lib/video';

// Galerie des résumés vidéo, filtrable par compétition.
export default function VideosScreen() {
  const { t } = useT();
  const videos = useFetch(() => listVideos(), [], { cacheKey: 'videos' });
  const competitions = useFetch(() => listCompetitions(), [], { cacheKey: 'competitions' });
  const [compId, setCompId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const all = videos.data ?? [];
  const list = useMemo(
    () => (compId ? all.filter((m) => m.competition_id === compId) : all),
    [all, compId],
  );
  // Ne proposer que les compétitions ayant au moins une vidéo.
  const compsWithVideos = (competitions.data ?? []).filter((c) =>
    all.some((m) => m.competition_id === c.id),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await videos.reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Vidéos')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {compsWithVideos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.md, gap: 7 }}>
          <FilterChip label={t('Toutes')} active={compId === null} onPress={() => setCompId(null)} />
          {compsWithVideos.map((c) => (
            <FilterChip key={c.id} label={c.name} active={compId === c.id} onPress={() => setCompId(c.id)} />
          ))}
        </ScrollView>
      )}

      {list.length === 0 ? (
        <Empty
          icon="videocam-outline"
          title={videos.loading ? t('Chargement…') : t('Pas encore de vidéo')}
          subtitle={t('Les résumés vidéo publiés par la fédération apparaîtront ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 12 }}>
          {list.map((m) => (
            <VideoCard key={m.id} match={m} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 13,
          paddingVertical: 7,
          borderRadius: R.pill,
          backgroundColor: active ? C.accentSoft : C.surface,
          borderWidth: 1,
          borderColor: active ? C.accent : C.border,
        },
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={{ color: active ? C.accent : C.muted, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

function VideoCard({ match: m }: { match: Match }) {
  const thumb = videoThumbnail(m.video_url);
  const title = `${m.home_team?.name ?? '?'} ${m.status !== 'scheduled' ? `${m.home_score} – ${m.away_score}` : 'vs'} ${m.away_team?.name ?? '?'}`;
  return (
    <Pressable onPress={() => router.push(`/match/${m.id}`)} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ height: 170, backgroundColor: C.surface2 }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ flex: 1 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="videocam-outline" size={36} color={C.dim} />
            </View>
          )}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        </View>
        <View style={{ padding: 12, gap: 5 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          <Row style={{ gap: 6 }}>
            <Text style={{ color: C.dim, fontSize: 11.5 }}>
              {[m.competition?.name, fullDate(m.scheduled_at)].filter(Boolean).join(' · ') ||
                `${teamShort(m.home_team)} – ${teamShort(m.away_team)}`}
            </Text>
          </Row>
        </View>
      </Card>
    </Pressable>
  );
}
