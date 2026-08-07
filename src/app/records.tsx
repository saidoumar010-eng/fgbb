import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listSeasonRecords, type HighColumn, type RecordCategory, type RecordRow } from '@/lib/db-stats';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

const ICONS: Record<HighColumn, keyof typeof Ionicons.glyphMap> = {
  points: 'flame-outline',
  rebounds: 'albums-outline',
  assists: 'share-social-outline',
  steals: 'hand-left-outline',
  blocks: 'shield-outline',
  three_made: 'locate-outline',
};

// Meilleures performances individuelles sur un match, catégorie par catégorie.
export default function RecordsScreen() {
  const { t } = useT();
  const { data, loading, reload } = useFetch(() => listSeasonRecords(), [], { cacheKey: 'records' });
  const [refreshing, setRefreshing] = useState(false);

  // Une catégorie sans aucune performance n'a rien à montrer : on la masque.
  const cats = (data ?? []).filter((c) => c.rows.length > 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Records de la saison')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {cats.length === 0 ? (
        <Empty
          icon="trophy-outline"
          title={loading ? t('Chargement…') : t('Aucun record')}
          subtitle={loading ? undefined : t('Les records apparaîtront dès que des box scores auront été saisis.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 12 }}>
          <Text style={{ color: C.dim, fontSize: 12.5, marginBottom: 2 }}>
            {t('Meilleures performances individuelles sur un match.')}
          </Text>
          {cats.map((c) => (
            <RecordCard key={c.key} cat={c} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RecordCard({ cat }: { cat: RecordCategory }) {
  const { t } = useT();
  const [best, ...rest] = cat.rows;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ gap: 8, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10 }}>
        <Ionicons name={ICONS[cat.key]} size={15} color={C.accent} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{t(cat.label)}</Text>
      </Row>

      <Pressable onPress={() => router.push(`/player/${best.player_id}`)}>
        <Row style={{ gap: 12, backgroundColor: C.surface2, paddingHorizontal: 13, paddingVertical: 12 }}>
          <Crest
            label={best.full_name.slice(0, 2).toUpperCase()}
            color={best.team_color ?? C.surface}
            image={best.photo_url}
            size={44}
            round
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {best.full_name}
            </Text>
            <Text style={{ color: C.muted, fontSize: 11.5 }} numberOfLines={1}>
              {subtitle(best, t)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: C.accent, fontSize: 24, fontWeight: '700' }}>{best[cat.key]}</Text>
            <Text style={{ color: C.dim, fontSize: 10.5 }}>{t(cat.unit)}</Text>
          </View>
        </Row>
      </Pressable>

      {rest.length > 0 && (
        <View style={{ paddingHorizontal: 13 }}>
          {rest.map((r, i) => (
            <Pressable key={r.id} onPress={() => router.push(`/player/${r.player_id}`)}>
              <Row
                style={{
                  gap: 10,
                  paddingVertical: 10,
                  borderBottomWidth: i < rest.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                <Text style={{ color: C.dim, fontSize: 12.5, fontWeight: '600', width: 16 }}>{i + 2}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={1}>
                    {r.full_name}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 11 }} numberOfLines={1}>
                    {subtitle(r, t)}
                  </Text>
                </View>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{r[cat.key]}</Text>
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

// « ASC · vs FCK · 12 mars 2026 » — on n'affiche que les morceaux connus.
function subtitle(r: RecordRow, t: (fr: string, vars?: Record<string, string | number>) => string) {
  return [r.team_short, r.opponent ? t('vs {equipe}', { equipe: r.opponent }) : null, fullDate(r.scheduled_at)]
    .filter(Boolean)
    .join(' · ');
}
