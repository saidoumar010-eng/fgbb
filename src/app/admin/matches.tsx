import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listMatches } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminMatches() {
  const { data, loading } = useFetch(() => listMatches());
  const matches = data ?? [];

  return (
    <Screen>
      <Header
        title="Matchs & stats"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button title="Nouveau match" icon="add" onPress={() => router.push('/admin/match-form')} />
      </View>

      {matches.length === 0 ? (
        <Empty
          icon="clipboard-outline"
          title={loading ? 'Chargement…' : 'Aucun match'}
          subtitle={loading ? undefined : 'Crée un match pour pouvoir saisir son score et ses statistiques.'}
        />
      ) : (
        <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
          {matches.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/admin/match/${m.id}`)}>
              <Card style={{ padding: 0 }}>
                <Row style={{ padding: 12, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                      {teamShort(m.home_team)} {m.status === 'scheduled' ? 'vs' : `${m.home_score}-${m.away_score}`}{' '}
                      {teamShort(m.away_team)}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                      {m.competition?.name ?? 'Sans compétition'}
                    </Text>
                  </View>
                  {m.status === 'live' && <Pill label="LIVE" tone="red" dot />}
                  {m.status === 'finished' && <Pill label="Terminé" tone="neutral" />}
                  {m.status === 'scheduled' && <Pill label="À venir" tone="accent" />}
                  <Ionicons name="chevron-forward" size={18} color={C.dim} />
                </Row>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
