import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getMyPollVote, listPollResults, listPolls, votePoll } from '@/lib/db';
import { C, R, S } from '@/lib/theme';
import type { Poll } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Fan zone : les sondages de la fédération. Le vote MVP et les pronostics
// se trouvent sur la page de chaque match.
export default function FanZoneScreen() {
  const polls = useFetch(() => listPolls());
  const [refreshing, setRefreshing] = useState(false);
  const list = (polls.data ?? []).filter((p) => p.is_active);

  const onRefresh = async () => {
    setRefreshing(true);
    await polls.reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title="Fan zone"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Row style={{ gap: 10 }}>
          <ShortcutCard icon="help-circle-outline" label="Quiz" onPress={() => router.push('/quiz' as never)} />
          <ShortcutCard
            icon="podium-outline"
            label="Classement fans"
            onPress={() => router.push('/classement-supporters' as never)}
          />
          <ShortcutCard icon="trophy-outline" label="Records" onPress={() => router.push('/records' as never)} />
        </Row>
        <Row style={{ gap: 10 }}>
          <ShortcutCard icon="git-compare-outline" label="Comparateur" onPress={() => router.push('/compare')} />
          <ShortcutCard icon="videocam-outline" label="Vidéos" onPress={() => router.push('/videos')} />
          <ShortcutCard icon="flame-outline" label="Leaders" onPress={() => router.push('/leaders')} />
        </Row>

        {list.length === 0 ? (
          <Empty
            icon="megaphone-outline"
            title={polls.loading ? 'Chargement…' : 'Aucun sondage en cours'}
            subtitle="Les sondages de la fédération apparaîtront ici. Reviens bientôt !"
          />
        ) : (
          list.map((p) => <PollCard key={p.id} poll={p} />)
        )}
      </View>
    </Screen>
  );
}

function ShortcutCard({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
      <Card style={{ alignItems: 'center', gap: 7, paddingVertical: 14 }}>
        <Ionicons name={icon} size={20} color={C.accent} />
        <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

function PollCard({ poll }: { poll: Poll }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const results = useFetch(() => listPollResults(poll.id), [poll.id]);
  const myVoteFetch = useFetch(() => (uid ? getMyPollVote(poll.id, uid) : Promise.resolve(null)), [poll.id, uid]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resultRows = results.data ?? [];
  const mine = myVoteFetch.data ?? null;
  const counts = poll.options.map((_, i) => resultRows.find((r) => r.option_index === i)?.votes ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);

  async function vote(index: number) {
    if (busy) return;
    if (!session) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await votePoll(poll.id, session.user.id, index);
      await Promise.all([results.reload(), myVoteFetch.reload()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600', marginBottom: 12 }}>{poll.question}</Text>
      <View style={{ gap: 8 }}>
        {poll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round((100 * counts[i]) / total) : 0;
          const selected = mine === i;
          return (
            <Pressable key={i} onPress={() => vote(i)} disabled={busy}>
              <View
                style={{
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: selected ? C.accent : C.border,
                  backgroundColor: C.surface2,
                  overflow: 'hidden',
                }}>
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${pct}%`,
                    backgroundColor: selected ? C.accentSoft : 'rgba(255,255,255,0.05)',
                  }}
                />
                <Row style={{ justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11 }}>
                  <Row style={{ gap: 8, flex: 1 }}>
                    {selected && <Ionicons name="checkmark-circle" size={15} color={C.accent} />}
                    <Text style={{ color: selected ? C.accent : C.text, fontSize: 13 }} numberOfLines={1}>
                      {opt}
                    </Text>
                  </Row>
                  {total > 0 && (
                    <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{pct}%</Text>
                  )}
                </Row>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: C.dim, fontSize: 11, marginTop: 10 }}>
        {err
          ? `Erreur : ${err}`
          : total === 0
            ? session
              ? 'Sois le premier à voter !'
              : 'Connecte-toi pour voter.'
            : `${total} vote${total > 1 ? 's' : ''}`}
      </Text>
    </Card>
  );
}
