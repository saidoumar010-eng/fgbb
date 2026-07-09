import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Row, Screen } from '@/components/ui';
import { listCompetitions } from '@/lib/db';
import { categoryLabel } from '@/lib/format';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminCompetitions() {
  const { data, loading } = useFetch(() => listCompetitions());
  const comps = data ?? [];

  return (
    <Screen>
      <Header
        title="Compétitions"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button title="Créer une compétition" icon="add" onPress={() => router.push('/admin/competition-form')} />
      </View>
      {comps.length === 0 ? (
        <Empty icon="trophy-outline" title={loading ? 'Chargement…' : 'Aucune compétition'} />
      ) : (
        <View style={{ paddingHorizontal: S.lg }}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {comps.map((c, i) => (
              <Pressable key={c.id} onPress={() => router.push(`/admin/competition-form?id=${c.id}`)}>
                <Row
                  style={{ paddingVertical: 12, gap: 12, borderBottomWidth: i < comps.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Ionicons name="trophy-outline" size={20} color={C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{c.name}</Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>
                      {categoryLabel(c.category)} · {c.season ?? c.type}
                    </Text>
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
