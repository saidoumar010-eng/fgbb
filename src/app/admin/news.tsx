import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Row, Screen } from '@/components/ui';
import { listNews } from '@/lib/db';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminNews() {
  const { data, loading } = useFetch(() => listNews());
  const { t } = useT();
  const news = data ?? [];

  return (
    <Screen>
      <Header
        title={t('Actualités')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button title={t('Publier une actualité')} icon="add" onPress={() => router.push('/admin/news-form')} />
      </View>
      {news.length === 0 ? (
        <Empty icon="newspaper-outline" title={loading ? t('Chargement…') : t('Aucune actualité')} />
      ) : (
        <View style={{ paddingHorizontal: S.lg }}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {news.map((n, i) => (
              <Pressable key={n.id} onPress={() => router.push(`/admin/news-form?id=${n.id}`)}>
                <Row
                  style={{ paddingVertical: 12, gap: 12, borderBottomWidth: i < news.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Ionicons name="newspaper-outline" size={20} color={C.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{fullDate(n.published_at)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.dim} />
                </Row>
              </Pressable>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}
