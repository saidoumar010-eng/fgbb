import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listTeams } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminTeams() {
  const { data, loading } = useFetch(() => listTeams());
  const teams = data ?? [];

  return (
    <Screen>
      <Header
        title="Équipes & clubs"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button title="Ajouter une équipe" icon="add" onPress={() => router.push('/admin/team-form')} />
      </View>
      {teams.length === 0 ? (
        <Empty icon="shirt-outline" title={loading ? 'Chargement…' : 'Aucune équipe'} />
      ) : (
        <View style={{ paddingHorizontal: S.lg }}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {teams.map((t, i) => (
              <Pressable key={t.id} onPress={() => router.push(`/admin/team-form?id=${t.id}`)}>
                <Row
                  style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < teams.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Crest label={teamShort(t)} color={t.color ?? C.surface2} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{t.name}</Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{t.division ?? t.city ?? '—'}</Text>
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
