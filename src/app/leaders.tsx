import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listLeadersBy } from '@/lib/db';
import { C, R, S } from '@/lib/theme';
import type { PlayerSeasonStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Cat = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg';
const CATS: { key: Cat; label: string; unit: string }[] = [
  { key: 'ppg', label: 'Points', unit: 'pts' },
  { key: 'rpg', label: 'Rebonds', unit: 'reb' },
  { key: 'apg', label: 'Passes', unit: 'pd' },
  { key: 'spg', label: 'Interceptions', unit: 'int' },
  { key: 'bpg', label: 'Contres', unit: 'ctr' },
];

export default function LeadersScreen() {
  const [cat, setCat] = useState<Cat>('ppg');
  const { data, loading } = useFetch(() => listLeadersBy(cat), [cat]);
  const rows = data ?? [];
  const unit = CATS.find((c) => c.key === cat)?.unit ?? '';

  return (
    <Screen scroll={false}>
      <Header
        title="Leaders"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ paddingVertical: S.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: 8 }}>
          {CATS.map((c) => {
            const on = cat === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCat(c.key)}
                style={{ backgroundColor: on ? C.gold : '#181D26', borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ color: on ? C.goldText : C.muted, fontSize: 12, fontWeight: '600' }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {rows.length === 0 ? (
        <Empty
          icon="podium-outline"
          title={loading ? 'Chargement…' : 'Aucune statistique'}
          subtitle={loading ? undefined : 'Les leaders apparaîtront dès que des box scores auront été saisis.'}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.xl * 2 }} showsVerticalScrollIndicator={false}>
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {rows.map((p: PlayerSeasonStat, i) => (
              <Pressable key={p.player_id} onPress={() => router.push(`/player/${p.player_id}`)}>
                <Row style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                  <Text style={{ color: i < 3 ? C.gold : C.dim, fontSize: 14, fontWeight: '600', width: 22 }}>{i + 1}</Text>
                  <Crest label={p.full_name.slice(0, 2).toUpperCase()} color={C.surface2} size={30} round />
                  <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                    {p.full_name}
                  </Text>
                  <Text style={{ color: C.gold, fontSize: 15, fontWeight: '600' }}>
                    {p[cat]} <Text style={{ color: C.dim, fontSize: 11 }}>{unit}</Text>
                  </Text>
                </Row>
              </Pressable>
            ))}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
