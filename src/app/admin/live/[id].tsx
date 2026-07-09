import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { getMatch } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { C, R, S } from '@/lib/theme';
import type { MatchStatus, QuarterScore } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type QScore = { home: number; away: number };

export default function LiveController() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: m, loading } = useFetch(() => getMatch(id), [id]);

  const [quarters, setQuarters] = useState<QScore[]>([
    { home: 0, away: 0 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
  ]);
  const [current, setCurrent] = useState(1);
  const [status, setStatus] = useState<MatchStatus>('live');
  const [savedAt, setSavedAt] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (m && !seeded.current) {
      const base: QScore[] = [
        { home: 0, away: 0 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
      ];
      (m.quarter_scores ?? []).forEach((q) => {
        if (q.q >= 1 && q.q <= base.length) base[q.q - 1] = { home: q.home, away: q.away };
        else if (q.q > base.length) base.push({ home: q.home, away: q.away });
      });
      setQuarters(base);
      setCurrent(m.current_quarter && m.current_quarter > 0 ? m.current_quarter : 1);
      setStatus(m.status === 'finished' ? 'finished' : 'live');
      seeded.current = true;
    }
  }, [m]);

  const totals = quarters.reduce(
    (acc, q) => ({ home: acc.home + q.home, away: acc.away + q.away }),
    { home: 0, away: 0 },
  );

  async function persist(nextQuarters: QScore[], nextCurrent: number, nextStatus: MatchStatus) {
    const t = nextQuarters.reduce((a, q) => ({ home: a.home + q.home, away: a.away + q.away }), { home: 0, away: 0 });
    const qs: QuarterScore[] = nextQuarters
      .slice(0, Math.max(nextCurrent, 1))
      .map((q, i) => ({ q: i + 1, home: q.home, away: q.away }));
    const { error } = await supabase
      .from('matches')
      .update({
        status: nextStatus,
        home_score: t.home,
        away_score: t.away,
        current_quarter: nextCurrent,
        quarter_scores: qs,
      })
      .eq('id', id);
    if (error) setErr(error.message);
    else {
      setErr(null);
      setSavedAt(Date.now());
    }
  }

  function addPoints(side: 'home' | 'away', n: number) {
    setQuarters((prev) => {
      const next = prev.map((q) => ({ ...q }));
      next[current - 1][side] = Math.max(0, next[current - 1][side] + n);
      if (status !== 'live') setStatus('live');
      persist(next, current, 'live');
      return next;
    });
  }

  function nextQuarter() {
    setQuarters((prev) => {
      const next = prev.map((q) => ({ ...q }));
      const nc = current + 1;
      if (nc > next.length) next.push({ home: 0, away: 0 });
      setCurrent(nc);
      persist(next, nc, 'live');
      return next;
    });
  }

  function finish() {
    Alert.alert('Terminer le match', 'Le score sera figé et le match marqué comme terminé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer',
        style: 'destructive',
        onPress: async () => {
          setStatus('finished');
          await persist(quarters, current, 'finished');
          router.back();
        },
      },
    ]);
  }

  if (!m) {
    return (
      <Screen>
        <Header
          title="En direct"
          left={
            <Pressable onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={C.muted} />
            </Pressable>
          }
        />
        <Empty icon="radio-outline" title={loading ? 'Chargement…' : 'Match introuvable'} />
      </Screen>
    );
  }

  const qLabel = current <= 4 ? `${current}e quart-temps` : `Prolongation ${current - 4}`;

  return (
    <Screen>
      <Header
        title="Contrôle en direct"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={<Pill label={status === 'finished' ? 'Terminé' : 'LIVE'} tone={status === 'finished' ? 'neutral' : 'red'} dot={status !== 'finished'} />}
      />

      <View style={{ padding: S.lg }}>
        <View style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 14 }}>
          <Row style={{ justifyContent: 'space-around', alignItems: 'center' }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Crest label={teamShort(m.home_team)} color={m.home_team?.color ?? C.surface2} size={44} image={m.home_team?.logo_url} />
              <Text style={{ color: C.text, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {m.home_team?.name}
              </Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 8 }}>
              {totals.home}-{totals.away}
            </Text>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Crest label={teamShort(m.away_team)} color={m.away_team?.color ?? C.surface2} size={44} image={m.away_team?.logo_url} />
              <Text style={{ color: C.text, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {m.away_team?.name}
              </Text>
            </View>
          </Row>
          <Text style={{ color: C.gold, fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '500' }}>{qLabel}</Text>
          <Text style={{ color: savedAt ? C.green : C.dim, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            {err ? `Erreur : ${err}` : savedAt ? 'Enregistré ✓' : 'Les changements sont enregistrés automatiquement'}
          </Text>
        </View>

        <Row style={{ gap: 12, marginTop: S.lg, alignItems: 'flex-start' }}>
          <TeamPad label={teamShort(m.home_team)} onAdd={(n) => addPoints('home', n)} onSub={() => addPoints('home', -1)} />
          <TeamPad label={teamShort(m.away_team)} onAdd={(n) => addPoints('away', n)} onSub={() => addPoints('away', -1)} />
        </Row>

        <Pressable
          onPress={nextQuarter}
          style={{ marginTop: S.lg, backgroundColor: C.surface2, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '500' }}>Quart-temps suivant →</Text>
        </Pressable>
        <Pressable
          onPress={finish}
          style={{ marginTop: 10, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(226,59,59,0.5)' }}>
          <Text style={{ color: C.red, fontSize: 15, fontWeight: '500' }}>Terminer le match</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function TeamPad({ label, onAdd, onSub }: { label: string; onAdd: (n: number) => void; onSub: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 8, fontWeight: '500' }}>{label}</Text>
      <Pressable
        onPress={() => onAdd(2)}
        style={({ pressed }) => [
          { backgroundColor: C.gold, borderRadius: R.md, paddingVertical: 22, alignItems: 'center' },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={{ color: C.goldText, fontSize: 24, fontWeight: '600' }}>+2</Text>
      </Pressable>
      <Row style={{ gap: 8, marginTop: 8 }}>
        <PadBtn label="+1" onPress={() => onAdd(1)} />
        <PadBtn label="+3" onPress={() => onAdd(3)} />
      </Row>
      <Pressable
        onPress={onSub}
        style={{ marginTop: 8, borderRadius: R.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.dim, fontSize: 13 }}>− 1 (corriger)</Text>
      </Pressable>
    </View>
  );
}

function PadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
