import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card, Header, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { C, S } from '@/lib/theme';

const QUICK: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string; color: string }[] = [
  { icon: 'create-outline', label: 'Saisir un score', href: '/admin/matches', color: C.accent },
  { icon: 'calendar-outline', label: 'Programmer', href: '/admin/match-form', color: C.accent },
  { icon: 'newspaper-outline', label: 'Actualité', href: '/admin/news-form', color: C.green },
];

const MANAGE: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; href: string }[] = [
  { icon: 'people-outline', title: 'Joueurs', sub: 'Ajouter, modifier, supprimer', href: '/admin/players' },
  { icon: 'shirt-outline', title: 'Équipes & clubs', sub: 'Effectifs, logos, divisions', href: '/admin/teams' },
  { icon: 'trophy-outline', title: 'Compétitions', sub: 'Championnats, coupes, saisons', href: '/admin/competitions' },
  { icon: 'clipboard-outline', title: 'Matchs & statistiques', sub: 'Scores, box score, vidéos', href: '/admin/matches' },
  { icon: 'newspaper-outline', title: 'Actualités', sub: 'Publier, modifier, supprimer', href: '/admin/news' },
];

export default function AdminDashboard() {
  return (
    <Screen>
      <Header
        title="Fédération"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={<Pill label="Admin" tone="accent" />}
      />

      <View style={{ flexDirection: 'row', gap: 9, padding: S.lg }}>
        {QUICK.map((q) => (
          <Pressable key={q.label} style={{ flex: 1 }} onPress={() => router.push(q.href as never)}>
            <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name={q.icon} size={22} color={q.color} />
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 7, textAlign: 'center' }}>
                {q.label}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Gestion des données" />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          {MANAGE.map((m, i) => (
            <Pressable key={m.title} onPress={() => router.push(m.href as never)}>
              <Row
                style={{
                  paddingVertical: 13,
                  gap: 13,
                  borderBottomWidth: i < MANAGE.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                <Ionicons name={m.icon} size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>{m.title}</Text>
                  <Text style={{ color: C.dim, fontSize: 12 }}>{m.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.dim} />
              </Row>
            </Pressable>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
