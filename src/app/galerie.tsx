import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PhotoGallery } from '@/components/photo-gallery';
import { Card, Empty, Header, Row, Screen } from '@/components/ui';
import { listAlbums, type GalleryGroup } from '@/lib/db-content';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Écran « Photos » : les albums de la fédération et les matchs photographiés.
// La galerie s'ouvre dans le même écran pour éviter un aller-retour de route.
export default function GalerieScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listAlbums());
  const [selected, setSelected] = useState<GalleryGroup | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const groups = data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  if (selected) {
    return (
      <Screen>
        <Header
          title={groupTitle(selected, t)}
          left={
            <Pressable onPress={() => setSelected(null)}>
              <Ionicons name="chevron-back" size={24} color={C.muted} />
            </Pressable>
          }
          right={
            selected.matchId ? (
              <Pressable onPress={() => router.push(`/match/${selected.matchId}`)}>
                <Ionicons name="basketball-outline" size={22} color={C.accent} />
              </Pressable>
            ) : null
          }
        />
        <View style={{ paddingTop: S.lg }}>
          <PhotoGallery matchId={selected.matchId} album={selected.album} showTitle={false} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Photos')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {groups.length === 0 ? (
        <Empty
          icon="images-outline"
          title={loading ? t('Chargement…') : t('Aucune photo')}
          subtitle={loading ? undefined : t('Les galeries publiées par la fédération apparaîtront ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 12 }}>
          {groups.map((g) => (
            <Pressable
              key={g.key}
              onPress={() => setSelected(g)}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ height: 150, backgroundColor: C.surface2 }}>
                  {g.cover ? (
                    <Image source={{ uri: g.cover }} style={{ flex: 1 }} contentFit="cover" transition={150} />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="images-outline" size={32} color={C.dim} />
                    </View>
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      right: 10,
                      bottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: R.pill,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                    }}>
                    <Ionicons name="images" size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>{g.count}</Text>
                  </View>
                </View>
                <View style={{ padding: 12, gap: 4 }}>
                  <Row style={{ gap: 7 }}>
                    <Ionicons
                      name={g.kind === 'match' ? 'basketball-outline' : 'albums-outline'}
                      size={14}
                      color={C.accent}
                    />
                    <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                      {groupTitle(g, t)}
                    </Text>
                  </Row>
                  <Text style={{ color: C.dim, fontSize: 11.5 }} numberOfLines={1}>
                    {groupSubtitle(g, t)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

type Translate = (fr: string, vars?: Record<string, string | number>) => string;

function groupTitle(g: GalleryGroup, t: Translate) {
  if (g.kind === 'album') return g.album ?? t('Album');
  const m = g.match;
  if (!m) return t('Match');
  return `${m.home_team?.name ?? '?'} – ${m.away_team?.name ?? '?'}`;
}

function groupSubtitle(g: GalleryGroup, t: Translate) {
  const count = t('{n} photos', { n: g.count });
  if (g.kind === 'album') return count;
  const parts = [g.match?.competition?.name, fullDate(g.match?.scheduled_at), count];
  return parts.filter(Boolean).join(' · ');
}
