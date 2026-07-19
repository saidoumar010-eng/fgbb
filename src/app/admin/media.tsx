import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listMedia, mediaKindLabel } from '@/lib/db-content';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';
import { videoThumbnail } from '@/lib/video';

export default function AdminMedia() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listMedia());
  const items = data ?? [];

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <Screen>
      <Header
        title={t('Médiathèque')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/media-form' as never)}>
            <Ionicons name="add" size={26} color={C.accent} />
          </Pressable>
        }
      />

      {items.length === 0 ? (
        <Empty
          icon="albums-outline"
          title={loading ? t('Chargement…') : t('Aucun média')}
          subtitle={t('Ajoute les interviews, podcasts, reportages et vidéos de la fédération.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {items.map((m) => {
            const thumb = m.cover_url || videoThumbnail(m.url);
            return (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/admin/media-form?id=${m.id}` as never)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                <Card>
                  <Row style={{ gap: 12 }}>
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: R.sm,
                        backgroundColor: C.surface2,
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={{ width: 56, height: 56 }} contentFit="cover" />
                      ) : (
                        <Ionicons name="play-outline" size={20} color={C.dim} />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={2}>
                        {m.title}
                      </Text>
                      <Row style={{ gap: 8 }}>
                        <Pill label={t(mediaKindLabel(m.kind))} tone="accent" />
                        <Text style={{ color: C.dim, fontSize: 11.5 }}>
                          {[m.duration_min ? t('{n} min', { n: m.duration_min }) : null, fullDate(m.published_at)]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
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
