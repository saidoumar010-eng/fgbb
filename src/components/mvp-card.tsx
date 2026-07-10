import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getTeamPlayers, listMvpVotes, voteMvp } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, R } from '@/lib/theme';
import type { Match, Player } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Vote MVP des supporters : ouvert pendant et après le match.
export function MvpCard({ match }: { match: Match }) {
  const { session } = useAuth();
  const votes = useFetch(() => listMvpVotes(match.id), [match.id]);
  const homePlayers = useFetch(() => getTeamPlayers(match.home_team_id), [match.home_team_id]);
  const awayPlayers = useFetch(() => getTeamPlayers(match.away_team_id), [match.away_team_id]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (match.status === 'scheduled') return null;

  const all = votes.data ?? [];
  const players = [...(homePlayers.data ?? []), ...(awayPlayers.data ?? [])];
  const byId = new Map(players.map((p) => [p.id, p]));

  const counts = new Map<string, number>();
  for (const v of all) counts.set(v.player_id, (counts.get(v.player_id) ?? 0) + 1);
  const ranking = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const myVote = all.find((v) => v.user_id === session?.user.id)?.player_id ?? null;

  async function vote(playerId: string) {
    if (busy) return;
    if (!session) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await voteMvp(match.id, session.user.id, playerId);
      await votes.reload();
      setExpanded(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const playerLabel = (p?: Player) =>
    p ? `${p.number != null ? `#${p.number} ` : ''}${p.full_name}` : 'Joueur';

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Row style={{ gap: 7 }}>
          <Ionicons name="trophy-outline" size={15} color={C.flagYellow} />
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>MVP du match — vote des supporters</Text>
        </Row>
        <Text style={{ color: C.dim, fontSize: 11 }}>
          {all.length > 0 ? `${all.length} vote${all.length > 1 ? 's' : ''}` : ''}
        </Text>
      </Row>

      {ranking.length > 0 ? (
        <View style={{ gap: 7, marginBottom: 4 }}>
          {ranking.map(([playerId, n], i) => {
            const p = byId.get(playerId);
            const pct = Math.round((100 * n) / all.length);
            return (
              <Pressable key={playerId} onPress={() => p && router.push(`/player/${p.id}`)}>
                <Row style={{ gap: 8 }}>
                  <Text style={{ color: i === 0 ? C.flagYellow : C.dim, fontSize: 12, width: 16, fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text
                        style={{ color: playerId === myVote ? C.accent : C.text, fontSize: 12.5, flex: 1 }}
                        numberOfLines={1}>
                        {playerLabel(p)}
                        {p?.team_id ? (
                          <Text style={{ color: C.dim, fontSize: 11 }}>
                            {'  '}
                            {teamShort(p.team_id === match.home_team_id ? match.home_team : match.away_team)}
                          </Text>
                        ) : null}
                      </Text>
                      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{pct}%</Text>
                    </Row>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: C.surface2, marginTop: 4 }}>
                      <View
                        style={{
                          width: `${Math.max(pct, 3)}%`,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: i === 0 ? C.flagYellow : C.accent,
                        }}
                      />
                    </View>
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: C.dim, fontSize: 12, marginBottom: 6 }}>
          Aucun vote pour le moment — désigne ton MVP !
        </Text>
      )}

      <Pressable
        onPress={() => (session ? setExpanded((e) => !e) : router.push('/login'))}
        style={({ pressed }) => [
          {
            marginTop: 8,
            paddingVertical: 10,
            borderRadius: R.md,
            alignItems: 'center',
            backgroundColor: expanded ? C.surface2 : C.accentSoft,
          },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>
          {!session ? 'Se connecter pour voter' : expanded ? 'Fermer' : myVote ? 'Changer mon vote' : 'Voter pour le MVP'}
        </Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 10, gap: 10 }}>
          {(
            [
              [match.home_team, homePlayers.data ?? []],
              [match.away_team, awayPlayers.data ?? []],
            ] as const
          ).map(([team, roster]) => (
            <View key={teamShort(team)}>
              <Text style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>{team?.name ?? 'Équipe'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {roster.length === 0 ? (
                  <Text style={{ color: C.dim, fontSize: 12 }}>Aucun joueur enregistré.</Text>
                ) : (
                  roster.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => vote(p.id)}
                      disabled={busy}
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          borderRadius: R.pill,
                          borderWidth: 1,
                          borderColor: myVote === p.id ? C.accent : C.border,
                          backgroundColor: myVote === p.id ? C.accentSoft : C.surface2,
                        },
                        pressed && { opacity: 0.8 },
                      ]}>
                      <Text style={{ color: myVote === p.id ? C.accent : C.text, fontSize: 12 }}>
                        {playerLabel(p)}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {err ? <Text style={{ color: C.red, fontSize: 11, marginTop: 8 }}>Erreur : {err}</Text> : null}
    </Card>
  );
}
