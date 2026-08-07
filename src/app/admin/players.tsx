import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listPlayers } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminPlayers() {
  const { t } = useT();
  const { data, loading } = useFetch(() => listPlayers());
  const players = data ?? [];

  return (
    <Screen>
      <Header
        title={t('Joueurs')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button title={t('Ajouter un joueur')} icon="add" onPress={() => router.push('/admin/player-form')} />
      </View>
      {players.length === 0 ? (
        <Empty icon="people-outline" title={loading ? t('Chargement…') : t('Aucun joueur')} />
      ) : (
        <View style={{ paddingHorizontal: S.lg }}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {players.map((p, i) => (
              <Pressable key={p.id} onPress={() => router.push(`/admin/player-form?id=${p.id}`)}>
                <Row
                  style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < players.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Crest label={p.full_name.slice(0, 2).toUpperCase()} color={C.surface2} size={30} round />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{p.full_name}</Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{p.position ? t(p.position) : '—'}</Text>
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
