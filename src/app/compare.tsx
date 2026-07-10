import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { getPlayerSeason, listPlayers, listTeams } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { Player, PlayerSeasonStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const COLOR_A = C.accent;
const COLOR_B = C.flagYellow;

// Comparateur : deux joueurs face à face, stat par stat (moyennes de la saison).
export default function CompareScreen() {
  const { a } = useLocalSearchParams<{ a?: string }>();
  const players = useFetch(() => listPlayers());
  const teams = useFetch(() => listTeams());
  const [idA, setIdA] = useState<string | null>(a ?? null);
  const [idB, setIdB] = useState<string | null>(null);
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);
  const [query, setQuery] = useState('');

  const seasonA = useFetch(() => (idA ? getPlayerSeason(idA) : Promise.resolve(null)), [idA]);
  const seasonB = useFetch(() => (idB ? getPlayerSeason(idB) : Promise.resolve(null)), [idB]);

  const byId = useMemo(() => new Map((players.data ?? []).map((p) => [p.id, p])), [players.data]);
  const teamById = useMemo(() => new Map((teams.data ?? []).map((t) => [t.id, t])), [teams.data]);
  const pA = idA ? byId.get(idA) : undefined;
  const pB = idB ? byId.get(idB) : undefined;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players.data ?? [])
      .filter((p) => p.id !== idA && p.id !== idB)
      .filter((p) => (q ? p.full_name.toLowerCase().includes(q) : true))
      .slice(0, 30);
  }, [players.data, query, idA, idB]);

  function pick(p: Player) {
    if (picking === 'A') setIdA(p.id);
    else setIdB(p.id);
    setPicking(null);
    setQuery('');
  }

  return (
    <Screen>
      <Header
        title="Comparateur"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Row style={{ gap: 10, alignItems: 'stretch' }}>
          <PlayerSlot
            player={pA}
            team={pA?.team_id ? teamById.get(pA.team_id) : undefined}
            color={COLOR_A}
            onPress={() => setPicking(picking === 'A' ? null : 'A')}
            picking={picking === 'A'}
          />
          <View style={{ justifyContent: 'center' }}>
            <Text style={{ color: C.dim, fontSize: 13, fontWeight: '700' }}>VS</Text>
          </View>
          <PlayerSlot
            player={pB}
            team={pB?.team_id ? teamById.get(pB.team_id) : undefined}
            color={COLOR_B}
            onPress={() => setPicking(picking === 'B' ? null : 'B')}
            picking={picking === 'B'}
          />
        </Row>

        {picking && (
          <Card>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              Choisir le joueur {picking}
            </Text>
            <TextInput
              placeholder="Rechercher un joueur…"
              placeholderTextColor={C.dim}
              value={query}
              onChangeText={setQuery}
              style={{
                backgroundColor: '#09271F',
                borderWidth: 1,
                borderColor: C.borderStrong,
                borderRadius: R.sm,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: C.text,
                fontSize: 14,
                marginBottom: 8,
              }}
            />
            {candidates.length === 0 ? (
              <Text style={{ color: C.dim, fontSize: 12.5, paddingVertical: 8 }}>
                {players.loading ? 'Chargement…' : 'Aucun joueur trouvé.'}
              </Text>
            ) : (
              candidates.map((p, i) => (
                <Pressable key={p.id} onPress={() => pick(p)}>
                  <Row
                    style={{
                      paddingVertical: 9,
                      gap: 10,
                      borderBottomWidth: i < candidates.length - 1 ? 1 : 0,
                      borderBottomColor: C.border,
                    }}>
                    <Crest
                      label={p.number != null ? `${p.number}` : p.full_name.slice(0, 2).toUpperCase()}
                      size={26}
                      round
                      image={p.photo_url}
                      color={C.surface2}
                    />
                    <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                      {p.full_name}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 11.5 }}>
                      {p.team_id ? teamShort(teamById.get(p.team_id)) : ''}
                    </Text>
                  </Row>
                </Pressable>
              ))
            )}
          </Card>
        )}

        {pA && pB ? (
          <CompareTable a={seasonA.data ?? null} b={seasonB.data ?? null} />
        ) : (
          <Empty
            icon="git-compare-outline"
            title="Choisis deux joueurs"
            subtitle="Sélectionne un joueur de chaque côté pour comparer leurs statistiques de la saison."
          />
        )}
      </View>
    </Screen>
  );
}

function PlayerSlot({
  player,
  team,
  color,
  onPress,
  picking,
}: {
  player?: Player;
  team?: { short_name: string | null; name: string } | { short_name: string | null; name: string | null };
  color: string;
  onPress: () => void;
  picking: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card
        style={{
          alignItems: 'center',
          gap: 7,
          paddingVertical: 14,
          borderColor: picking ? color : C.border,
          borderWidth: 1,
        }}>
        {player?.photo_url ? (
          <Image
            source={{ uri: player.photo_url }}
            style={{ width: 54, height: 54, borderRadius: 27 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: C.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name={player ? 'person' : 'add'} size={24} color={player ? C.muted : color} />
          </View>
        )}
        <Text style={{ color: player ? C.text : color, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
          {player ? player.full_name : 'Choisir un joueur'}
        </Text>
        {player ? (
          <Text style={{ color: C.dim, fontSize: 11 }}>
            {[player.number != null ? `#${player.number}` : null, team ? teamShort(team) : null]
              .filter(Boolean)
              .join(' · ') || ' '}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

const STATS: { key: keyof PlayerSeasonStat; label: string; pct?: boolean }[] = [
  { key: 'ppg', label: 'Points / match' },
  { key: 'rpg', label: 'Rebonds / match' },
  { key: 'apg', label: 'Passes déc. / match' },
  { key: 'spg', label: 'Interceptions / match' },
  { key: 'bpg', label: 'Contres / match' },
  { key: 'fg_pct', label: '% aux tirs', pct: true },
  { key: 'three_pct', label: '% à 3 points', pct: true },
  { key: 'games', label: 'Matchs joués' },
];

function CompareTable({ a, b }: { a: PlayerSeasonStat | null; b: PlayerSeasonStat | null }) {
  if (!a && !b) {
    return (
      <Card>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          Aucune statistique enregistrée pour ces joueurs cette saison.
        </Text>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 12 }}>
      {STATS.map(({ key, label, pct }) => {
        const va = Number(a?.[key] ?? 0);
        const vb = Number(b?.[key] ?? 0);
        const max = Math.max(va, vb, 0.001);
        const fmt = (v: number) => (pct ? `${Math.round(v)}%` : Number.isInteger(v) ? `${v}` : v.toFixed(1));
        return (
          <View key={key}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: va >= vb ? C.text : C.muted, fontSize: 13, fontWeight: va >= vb ? '700' : '400', width: 52 }}>
                {fmt(va)}
              </Text>
              <Text style={{ color: C.dim, fontSize: 11.5 }}>{label}</Text>
              <Text
                style={{
                  color: vb >= va ? C.text : C.muted,
                  fontSize: 13,
                  fontWeight: vb >= va ? '700' : '400',
                  width: 52,
                  textAlign: 'right',
                }}>
                {fmt(vb)}
              </Text>
            </Row>
            <Row style={{ gap: 6 }}>
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.surface2, alignItems: 'flex-end' }}>
                <View
                  style={{
                    width: `${Math.max((100 * va) / max, 2)}%`,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: COLOR_A,
                  }}
                />
              </View>
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.surface2 }}>
                <View
                  style={{
                    width: `${Math.max((100 * vb) / max, 2)}%`,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: COLOR_B,
                  }}
                />
              </View>
            </Row>
          </View>
        );
      })}
    </Card>
  );
}
