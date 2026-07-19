import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listReferees, refereeLevelLabel } from '@/lib/db-officials';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminReferees() {
  const { t } = useT();
  const { data, loading } = useFetch(() => listReferees());
  const referees = data ?? [];

  return (
    <Screen>
      <Header
        title={t('Arbitres')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button
          title={t('Ajouter un arbitre')}
          icon="add"
          onPress={() => router.push('/admin/referee-form' as never)}
        />
      </View>

      {referees.length === 0 ? (
        <Empty
          icon="person-outline"
          title={loading ? t('Chargement…') : t('Aucun arbitre')}
          subtitle={loading ? undefined : t('Les arbitres inscrits pourront être désignés sur les matchs.')}
        />
      ) : (
        <View style={{ paddingHorizontal: S.lg }}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {referees.map((r, i) => (
              <Pressable key={r.id} onPress={() => router.push(`/admin/referee-form?id=${r.id}` as never)}>
                <Row
                  style={{
                    paddingVertical: 11,
                    gap: 12,
                    borderBottomWidth: i < referees.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                  }}>
                  <Crest
                    label={r.full_name.slice(0, 2).toUpperCase()}
                    color={C.surface2}
                    size={30}
                    round
                    image={r.photo_url}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{r.full_name}</Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>
                      {t(refereeLevelLabel(r.level))}
                      {r.city ? ` · ${r.city}` : ''}
                    </Text>
                  </View>
                  {r.is_active ? null : <Pill label={t('Inactif')} tone="neutral" />}
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
