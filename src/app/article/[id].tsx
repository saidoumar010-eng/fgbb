import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, Text, View } from 'react-native';

import { Comments } from '@/components/comments';
import { Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { getNewsItem } from '@/lib/db';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function ArticleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const article = useFetch(() => getNewsItem(id), [id], { cacheKey: `article:${id}` });
  const n = article.data;
  const paragraphs = (n?.body ?? '').split('\n').filter((p) => p.trim().length > 0);

  async function shareArticle() {
    if (!n) return;
    await Share.share({ message: `${n.title}\n\n${t("À lire sur l'application FGBB.")}` });
  }

  return (
    <Screen>
      <Header
        title={t('Article')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={<Ionicons name="share-social-outline" size={20} color={C.muted} onPress={shareArticle} />}
      />
      {!n ? (
        <Empty icon="newspaper-outline" title={article.loading ? t('Chargement…') : t('Article introuvable')} />
      ) : (
        <View>
          {n.cover_url ? (
            <Image
              source={{ uri: n.cover_url }}
              style={{ height: 180, marginHorizontal: S.lg, borderRadius: R.lg }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                height: 180,
                marginHorizontal: S.lg,
                borderRadius: R.lg,
                backgroundColor: C.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="image-outline" size={32} color={C.placeholderIcon} />
            </View>
          )}
          <View style={{ padding: S.lg }}>
            {n.category ? <Pill label={n.category.toUpperCase()} tone="green" /> : null}
            <Text style={{ color: C.text, fontSize: 21, fontWeight: '600', lineHeight: 28, marginTop: 11 }}>
              {n.title}
            </Text>
            <Row style={{ gap: 9, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Crest label="FG" color={C.surface2} size={34} round />
              <View>
                <Text style={{ color: C.text, fontSize: 12 }}>{n.author ?? 'FGBB'}</Text>
                <Text style={{ color: C.dim, fontSize: 11 }}>{fullDate(n.published_at)}</Text>
              </View>
            </Row>
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                <Text key={i} style={{ color: C.muted, fontSize: 14, lineHeight: 24, marginTop: 13 }}>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={{ color: C.dim, fontSize: 14, marginTop: 13 }}>{t('(Pas de contenu)')}</Text>
            )}

            <View style={{ marginTop: S.xl }}>
              <Comments targetType="news" targetId={id} />
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}
