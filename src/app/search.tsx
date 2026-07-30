import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Crest, Empty, Row, SectionTitle } from '@/components/ui';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, S } from '@/lib/theme';
import type { Player, Team } from '@/lib/types';

export default function SearchScreen() {
  const { t: tr } = useT();
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPlayers([]);
      setTeams([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const [pl, tm] = await Promise.all([
        supabase.from('players').select('*').ilike('full_name', `%${term}%`).limit(15),
        supabase.from('teams').select('*').ilike('name', `%${term}%`).limit(15),
      ]);
      if (!active) return;
      setPlayers((pl.data ?? []) as Player[]);
      setTeams((tm.data ?? []) as Team[]);
      setLoading(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  const empty = q.trim().length >= 2 && !loading && players.length === 0 && teams.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Row style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 10 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
        <View style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
          <Ionicons name="search" size={16} color={C.dim} style={{ position: 'absolute', left: 11, zIndex: 1 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder={tr('Joueur, équipe…')}
            placeholderTextColor={C.dim}
            style={{
              backgroundColor: C.inputBg,
              borderWidth: 1,
              borderColor: C.borderStrong,
              borderRadius: 9,
              paddingVertical: 10,
              paddingLeft: 34,
              paddingRight: 12,
              color: C.text,
              fontSize: 14,
            }}
          />
        </View>
      </Row>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {q.trim().length < 2 ? (
          <Empty
            icon="search-outline"
            title={tr('Rechercher')}
            subtitle={tr('Tape au moins 2 lettres pour trouver un joueur ou une équipe.')}
          />
        ) : empty ? (
          <Empty
            icon="search-outline"
            title={tr('Aucun résultat')}
            subtitle={tr('Rien trouvé pour « {q} ».', { q: q.trim() })}
          />
        ) : (
          <>
            {teams.length > 0 && (
              <>
                <SectionTitle title={tr('Équipes')} />
                <View style={{ paddingHorizontal: S.lg }}>
                  <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
                    {teams.map((t, i) => (
                      <Pressable key={t.id} onPress={() => router.push(`/team/${t.id}`)}>
                        <Row style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < teams.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                          <Crest label={teamShort(t)} color={t.color ?? C.surface2} size={30} />
                          <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{t.name}</Text>
                          <Ionicons name="chevron-forward" size={18} color={C.dim} />
                        </Row>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              </>
            )}
            {players.length > 0 && (
              <>
                <SectionTitle title={tr('Joueurs')} />
                <View style={{ paddingHorizontal: S.lg }}>
                  <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
                    {players.map((p, i) => (
                      <Pressable key={p.id} onPress={() => router.push(`/player/${p.id}`)}>
                        <Row style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < players.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                          <Crest label={p.full_name.slice(0, 2).toUpperCase()} color={C.surface2} size={30} round />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.text, fontSize: 14 }}>{p.full_name}</Text>
                            <Text style={{ color: C.dim, fontSize: 12 }}>{p.position ?? ''}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={C.dim} />
                        </Row>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
