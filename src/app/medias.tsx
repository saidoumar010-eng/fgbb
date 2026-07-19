import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listMedia, mediaKindLabel, MEDIA_KINDS } from '@/lib/db-content';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { MediaItem, MediaKind } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';
import { videoThumbnail } from '@/lib/video';

const ALL = 'all';

const ICONS: Record<MediaKind, keyof typeof Ionicons.glyphMap> = {
  interview: 'mic-outline',
  podcast: 'headset-outline',
  reportage: 'newspaper-outline',
  video: 'videocam-outline',
};

// Médiathèque : interviews, podcasts, reportages et vidéos de la fédération.
export default function MediasScreen() {
  const { t } = useT();
  const [kind, setKind] = useState<string>(ALL);
  const { data, loading, reload } = useFetch(
    () => listMedia(kind === ALL ? null : (kind as MediaKind)),
    [kind],
  );
  const [refreshing, setRefreshing] = useState(false);

  const items = data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Médiathèque')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        <ChipSelect
          options={[
            { id: ALL, label: t('Tout') },
            ...MEDIA_KINDS.map((k) => ({ id: k.id, label: t(k.label) })),
          ]}
          value={kind}
          onChange={setKind}
        />
      </View>

      {items.length === 0 ? (
        <Empty
          icon="albums-outline"
          title={loading ? t('Chargement…') : t('Aucun média')}
          subtitle={loading ? undefined : t('Les contenus publiés par la fédération apparaîtront ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 12 }}>
          {items.map((m) => (
            <MediaCard key={m.id} item={m} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function MediaCard({ item: m }: { item: MediaItem }) {
  const { t } = useT();
  // À défaut de vignette saisie, on récupère celle de YouTube.
  const thumb = m.cover_url || videoThumbnail(m.url);

  const open = () => {
    WebBrowser.openBrowserAsync(m.url).catch(() => {});
  };

  return (
    <Pressable onPress={open} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row style={{ alignItems: 'stretch' }}>
          <View style={{ width: 116, backgroundColor: C.surface2 }}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={{ flex: 1 }} contentFit="cover" transition={150} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 96 }}>
                <Ionicons name={ICONS[m.kind]} size={26} color={C.dim} />
              </View>
            )}
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 8,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: 'rgba(0,0,0,0.6)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name={ICONS[m.kind]} size={14} color="#fff" />
            </View>
          </View>

          <View style={{ flex: 1, padding: 12, gap: 6, justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={2}>
              {m.title}
            </Text>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              <Pill label={t(mediaKindLabel(m.kind))} tone="accent" />
              <Text style={{ color: C.dim, fontSize: 11.5 }}>
                {[m.duration_min ? t('{n} min', { n: m.duration_min }) : null, fullDate(m.published_at)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Row>
          </View>

          <View style={{ justifyContent: 'center', paddingRight: 12 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: R.pill,
                backgroundColor: C.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="open-outline" size={15} color={C.accent} />
            </View>
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}
