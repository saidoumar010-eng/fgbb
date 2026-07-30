import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Screen } from '@/components/ui';
import { listNews } from '@/lib/db';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function ActusScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listNews());
  const news = data ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header title={t('Actualités')} />
      {news.length > 0 ? (
        <View style={{ padding: S.lg, gap: 11 }}>
          {news.map((n) => (
            <Pressable key={n.id} onPress={() => router.push(`/article/${n.id}`)}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {n.cover_url ? (
                <Image source={{ uri: n.cover_url }} style={{ height: 130 }} contentFit="cover" />
              ) : (
                <View
                  style={{
                    height: 130,
                    backgroundColor: C.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Ionicons name="image-outline" size={28} color={C.placeholderIcon} />
                </View>
              )}
              <View style={{ padding: 12, gap: 8 }}>
                {n.category ? <Pill label={n.category.toUpperCase()} tone="green" /> : null}
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>
                  {n.title}
                </Text>
                <Text style={{ color: C.dim, fontSize: 11 }}>{fullDate(n.published_at)}</Text>
              </View>
            </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <Empty
          icon="newspaper-outline"
          title={loading ? t('Chargement…') : t('Aucune actualité')}
          subtitle={
            loading
              ? undefined
              : t('Les communiqués et articles publiés par la fédération apparaîtront ici.')
          }
        />
      )}
    </Screen>
  );
}
