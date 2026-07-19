import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { addMatchEvent, getMatch, getTeamPlayers } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, R, S } from '@/lib/theme';
import type { MatchStatus, Player, QuarterScore } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type QScore = { home: number; away: number };

export default function LiveController() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: m, loading } = useFetch(() => getMatch(id), [id]);
  const { t } = useT();

  // Effectifs pour attribuer chaque panier à un marqueur (optionnel).
  const homeRoster = useFetch(
    () => (m?.home_team_id ? getTeamPlayers(m.home_team_id) : Promise.resolve([] as Player[])),
    [m?.home_team_id],
  );
  const awayRoster = useFetch(
    () => (m?.away_team_id ? getTeamPlayers(m.away_team_id) : Promise.resolve([] as Player[])),
    [m?.away_team_id],
  );
  const [scorer, setScorer] = useState<{ home: string | null; away: string | null }>({
    home: null,
    away: null,
  });

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
      // Le quart courant doit couvrir au moins tous les quarts déjà saisis
      // (sinon un appui tronquerait les quarts suivants). On garde aussi
      // current_quarter s'il est plus avancé, et on complète le tableau pour
      // que `quarters[current - 1]` existe toujours (pas de crash en prolongation).
      const seededCurrent = Math.max(m.current_quarter ?? 0, base.length, 1);
      while (base.length < seededCurrent) base.push({ home: 0, away: 0 });
      setQuarters(base);
      setCurrent(seededCurrent);
      setStatus(m.status === 'finished' ? 'finished' : 'live');
      seeded.current = true;
    }
  }, [m]);

  const totals = quarters.reduce(
    (acc, q) => ({ home: acc.home + q.home, away: acc.away + q.away }),
    { home: 0, away: 0 },
  );

  async function persist(nextQuarters: QScore[], nextCurrent: number, nextStatus: MatchStatus) {
    // Nommé explicitement : `t` est la fonction de traduction dans ce fichier.
    const nextTotals = nextQuarters.reduce(
      (a, q) => ({ home: a.home + q.home, away: a.away + q.away }),
      { home: 0, away: 0 },
    );
    // On conserve tous les quarts jusqu'au quart courant ET jusqu'au dernier
    // quart contenant des points : jamais tronquer un quart déjà rempli.
    const lastWithData = nextQuarters.reduce((acc, q, i) => (q.home > 0 || q.away > 0 ? i + 1 : acc), 0);
    const keep = Math.max(nextCurrent, lastWithData, 1);
    const qs: QuarterScore[] = nextQuarters
      .slice(0, keep)
      .map((q, i) => ({ q: i + 1, home: q.home, away: q.away }));
    const { error } = await supabase
      .from('matches')
      .update({
        status: nextStatus,
        home_score: nextTotals.home,
        away_score: nextTotals.away,
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

  // Publie l'action dans le fil du match (play-by-play). Non bloquant :
  // le score officiel reste porté par la table matches.
  function logEvent(side: 'home' | 'away', n: number) {
    if (!m) return;
    const teamId = side === 'home' ? m.home_team_id : m.away_team_id;
    addMatchEvent(
      n > 0
        ? {
            match_id: id,
            team_id: teamId,
            player_id: scorer[side],
            kind: 'points',
            points: n,
            quarter: current,
          }
        : { match_id: id, team_id: teamId, kind: 'correction', points: n, quarter: current },
    ).catch((e) => setErr(e instanceof Error ? e.message : t('Erreur fil du match')));
  }

  function addPoints(side: 'home' | 'away', n: number) {
    setQuarters((prev) => {
      const next = prev.map((q) => ({ ...q }));
      next[current - 1][side] = Math.max(0, next[current - 1][side] + n);
      if (status !== 'live') setStatus('live');
      persist(next, current, 'live');
      return next;
    });
    logEvent(side, n);
  }

  function nextQuarter() {
    setQuarters((prev) => {
      const next = prev.map((q) => ({ ...q }));
      const nc = current + 1;
      if (nc > next.length) next.push({ home: 0, away: 0 });
      setCurrent(nc);
      persist(next, nc, 'live');
      addMatchEvent({ match_id: id, kind: 'quarter', quarter: nc }).catch(() => {});
      return next;
    });
  }

  function finish() {
    Alert.alert(t('Terminer le match'), t('Le score sera figé et le match marqué comme terminé.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Terminer'),
        style: 'destructive',
        onPress: async () => {
          setStatus('finished');
          await persist(quarters, current, 'finished');
          addMatchEvent({ match_id: id, kind: 'info', label: 'Fin du match' }).catch(() => {});
          router.back();
        },
      },
    ]);
  }

  if (!m) {
    return (
      <Screen>
        <Header
          title={t('En direct')}
          left={
            <Pressable onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={C.muted} />
            </Pressable>
          }
        />
        <Empty icon="radio-outline" title={loading ? t('Chargement…') : t('Match introuvable')} />
      </Screen>
    );
  }

  const qLabel =
    current <= 4
      ? t('{n}e quart-temps', { n: current })
      : t('Prolongation {n}', { n: current - 4 });

  return (
    <Screen>
      <Header
        title={t('Contrôle en direct')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={<Pill label={status === 'finished' ? t('Terminé') : 'LIVE'} tone={status === 'finished' ? 'neutral' : 'red'} dot={status !== 'finished'} />}
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
          <Text style={{ color: C.accent, fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '500' }}>{qLabel}</Text>
          <Text style={{ color: savedAt ? C.green : C.dim, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            {err
              ? t('Erreur : {msg}', { msg: err })
              : savedAt
                ? t('Enregistré ✓')
                : t('Les changements sont enregistrés automatiquement')}
          </Text>
        </View>

        <Row style={{ gap: 12, marginTop: S.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TeamPad label={teamShort(m.home_team)} onAdd={(n) => addPoints('home', n)} onSub={() => addPoints('home', -1)} />
            <ScorerPicker
              roster={homeRoster.data ?? []}
              value={scorer.home}
              onChange={(v) => setScorer((s) => ({ ...s, home: v }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TeamPad label={teamShort(m.away_team)} onAdd={(n) => addPoints('away', n)} onSub={() => addPoints('away', -1)} />
            <ScorerPicker
              roster={awayRoster.data ?? []}
              value={scorer.away}
              onChange={(v) => setScorer((s) => ({ ...s, away: v }))}
            />
          </View>
        </Row>

        <Pressable
          onPress={nextQuarter}
          style={{ marginTop: S.lg, backgroundColor: C.surface2, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '500' }}>{t('Quart-temps suivant →')}</Text>
        </Pressable>
        <Pressable
          onPress={finish}
          style={{ marginTop: 10, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(226,59,59,0.5)' }}>
          <Text style={{ color: C.red, fontSize: 15, fontWeight: '500' }}>{t('Terminer le match')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// Sélecteur de marqueur : le prochain panier sera attribué au joueur choisi.
function ScorerPicker({
  roster,
  value,
  onChange,
}: {
  roster: Player[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { t } = useT();
  if (roster.length === 0) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: C.dim, fontSize: 11, marginBottom: 6, textAlign: 'center' }}>
        {t('Marqueur (optionnel)')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
        {roster.map((p) => {
          const on = value === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onChange(on ? null : p.id)}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: R.pill,
                  borderWidth: 1,
                  borderColor: on ? C.accent : C.border,
                  backgroundColor: on ? C.accentSoft : C.surface,
                },
                pressed && { opacity: 0.8 },
              ]}>
              <Text style={{ color: on ? C.accent : C.muted, fontSize: 11.5 }} numberOfLines={1}>
                {p.number != null ? `#${p.number}` : p.full_name.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TeamPad({ label, onAdd, onSub }: { label: string; onAdd: (n: number) => void; onSub: () => void }) {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 8, fontWeight: '500' }}>{label}</Text>
      <Pressable
        onPress={() => onAdd(2)}
        style={({ pressed }) => [
          { backgroundColor: C.accent, borderRadius: R.md, paddingVertical: 22, alignItems: 'center' },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={{ color: C.accentText, fontSize: 24, fontWeight: '600' }}>+2</Text>
      </Pressable>
      <Row style={{ gap: 8, marginTop: 8 }}>
        <PadBtn label="+1" onPress={() => onAdd(1)} />
        <PadBtn label="+3" onPress={() => onAdd(3)} />
      </Row>
      <Pressable
        onPress={onSub}
        style={{ marginTop: 8, borderRadius: R.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.dim, fontSize: 13 }}>{t('− 1 (corriger)')}</Text>
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
