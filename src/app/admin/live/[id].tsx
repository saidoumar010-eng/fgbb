import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { addMatchEvent, getMatch, getTeamPlayers } from '@/lib/db';
import { teamShort } from '@/lib/format';
import {
  BONUS_FOULS,
  formatClock,
  isHalftimeBoundary,
  periodSeconds,
  remainingSeconds,
  timeoutsAllowed,
  useGameClock,
} from '@/lib/game-clock';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, R, S } from '@/lib/theme';
import type { MatchStatus, Player, QuarterScore } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Side = 'home' | 'away';
type QScore = { home: number; away: number };

/**
 * État complet de la table de marque, tenu d'un bloc.
 *
 * Toutes les actions produisent le prochain état puis l'enregistrent. Rien
 * n'est déclenché depuis un updater de `setState` : React peut les rejouer, ce
 * qui envoyait autrefois deux écritures et deux lignes de fil par appui.
 */
interface Board {
  quarters: QScore[];
  current: number;
  status: MatchStatus;
  clockSeconds: number;
  clockRunning: boolean;
  clockUpdatedAt: string | null;
  fouls: { home: number; away: number };
  timeouts: { home: number; away: number };
}

export default function LiveController() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: m, loading } = useFetch(() => getMatch(id), [id]);
  const { t } = useT();

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

  const [board, setBoard] = useState<Board>({
    quarters: [
      { home: 0, away: 0 },
      { home: 0, away: 0 },
      { home: 0, away: 0 },
      { home: 0, away: 0 },
    ],
    current: 1,
    status: 'live',
    clockSeconds: 600,
    clockRunning: false,
    clockUpdatedAt: null,
    fouls: { home: 0, away: 0 },
    timeouts: { home: 0, away: 0 },
  });
  const [savedAt, setSavedAt] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!m || seeded.current) return;
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
    // Le quart courant couvre au moins tous les quarts déjà saisis, sinon un
    // appui tronquerait les suivants. On complète le tableau pour que
    // `quarters[current - 1]` existe toujours, prolongations comprises.
    const current = Math.max(m.current_quarter ?? 0, base.length, 1);
    while (base.length < current) base.push({ home: 0, away: 0 });

    setBoard({
      quarters: base,
      current,
      status: m.status === 'finished' ? 'finished' : 'live',
      // On reprend le chrono là où la table de marque l'a laissé, y compris
      // s'il tournait encore : le temps écoulé pendant l'absence est décompté.
      clockSeconds: remainingSeconds({
        clock_seconds: m.clock_seconds ?? periodSeconds(current),
        clock_running: m.clock_running ?? false,
        clock_updated_at: m.clock_updated_at ?? null,
      }),
      clockRunning: false,
      clockUpdatedAt: null,
      fouls: { home: m.home_fouls ?? 0, away: m.away_fouls ?? 0 },
      timeouts: { home: m.home_timeouts ?? 0, away: m.away_timeouts ?? 0 },
    });
    seeded.current = true;
  }, [m]);

  const totals = board.quarters.reduce(
    (acc, q) => ({ home: acc.home + q.home, away: acc.away + q.away }),
    { home: 0, away: 0 },
  );
  const shown = useGameClock({
    clock_seconds: board.clockSeconds,
    clock_running: board.clockRunning,
    clock_updated_at: board.clockUpdatedAt,
  });

  async function persist(next: Board) {
    const nextTotals = next.quarters.reduce(
      (a, q) => ({ home: a.home + q.home, away: a.away + q.away }),
      { home: 0, away: 0 },
    );
    // On garde tous les quarts jusqu'au quart courant ET jusqu'au dernier
    // contenant des points : jamais tronquer un quart déjà rempli.
    const lastWithData = next.quarters.reduce((acc, q, i) => (q.home > 0 || q.away > 0 ? i + 1 : acc), 0);
    const keep = Math.max(next.current, lastWithData, 1);
    const qs: QuarterScore[] = next.quarters
      .slice(0, keep)
      .map((q, i) => ({ q: i + 1, home: q.home, away: q.away }));

    const { error } = await supabase
      .from('matches')
      .update({
        status: next.status,
        home_score: nextTotals.home,
        away_score: nextTotals.away,
        current_quarter: next.current,
        quarter_scores: qs,
        clock_seconds: next.clockSeconds,
        clock_running: next.clockRunning,
        clock_updated_at: next.clockUpdatedAt,
        home_fouls: next.fouls.home,
        away_fouls: next.fouls.away,
        home_timeouts: next.timeouts.home,
        away_timeouts: next.timeouts.away,
      })
      .eq('id', id);
    if (error) setErr(error.message);
    else {
      setErr(null);
      setSavedAt(Date.now());
    }
  }

  /** Applique un état et l'enregistre. Point de passage unique de toute action. */
  function commit(next: Board) {
    setBoard(next);
    persist(next);
  }

  /** Fige le chrono à la seconde courante : à appeler avant tout arrêt de jeu. */
  function frozen(b: Board): Board {
    return {
      ...b,
      clockSeconds: remainingSeconds({
        clock_seconds: b.clockSeconds,
        clock_running: b.clockRunning,
        clock_updated_at: b.clockUpdatedAt,
      }),
      clockRunning: false,
      clockUpdatedAt: null,
    };
  }

  function toggleClock() {
    if (board.clockRunning) {
      commit(frozen(board));
      return;
    }
    commit({ ...board, clockRunning: true, clockUpdatedAt: new Date().toISOString() });
  }

  function addPoints(side: Side, n: number) {
    const quarters = board.quarters.map((q) => ({ ...q }));
    quarters[board.current - 1][side] = Math.max(0, quarters[board.current - 1][side] + n);
    commit({ ...board, quarters, status: 'live' });

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
            quarter: board.current,
          }
        : { match_id: id, team_id: teamId, kind: 'correction', points: n, quarter: board.current },
    ).catch((e) => setErr(e instanceof Error ? e.message : t('Erreur fil du match')));
  }

  function addFoul(side: Side, n: number) {
    const fouls = { ...board.fouls, [side]: Math.max(0, board.fouls[side] + n) };
    // Une faute arrête le jeu : le chrono se fige, comme à la table.
    commit({ ...frozen(board), fouls });

    if (!m || n <= 0) return;
    addMatchEvent({
      match_id: id,
      team_id: side === 'home' ? m.home_team_id : m.away_team_id,
      player_id: scorer[side],
      kind: 'foul',
      quarter: board.current,
    }).catch(() => {});
  }

  function takeTimeout(side: Side) {
    const allowed = timeoutsAllowed(board.current);
    if (board.timeouts[side] >= allowed) {
      Alert.alert(
        t('Plus de temps mort'),
        t('Cette équipe a déjà utilisé ses {n} temps morts pour cette mi-temps.', { n: allowed }),
      );
      return;
    }
    const timeouts = { ...board.timeouts, [side]: board.timeouts[side] + 1 };
    commit({ ...frozen(board), timeouts });

    if (!m) return;
    addMatchEvent({
      match_id: id,
      team_id: side === 'home' ? m.home_team_id : m.away_team_id,
      kind: 'timeout',
      quarter: board.current,
    }).catch(() => {});
  }

  function nextQuarter() {
    const quarters = board.quarters.map((q) => ({ ...q }));
    const nc = board.current + 1;
    if (nc > quarters.length) quarters.push({ home: 0, away: 0 });

    commit({
      ...board,
      quarters,
      current: nc,
      status: 'live',
      // Nouveau quart-temps : chrono remis à la durée réglementaire, fautes
      // d'équipe effacées. Les temps morts ne repartent qu'à la mi-temps.
      clockSeconds: periodSeconds(nc),
      clockRunning: false,
      clockUpdatedAt: null,
      fouls: { home: 0, away: 0 },
      timeouts: isHalftimeBoundary(board.current, nc) ? { home: 0, away: 0 } : board.timeouts,
    });
    addMatchEvent({ match_id: id, kind: 'quarter', quarter: nc }).catch(() => {});
  }

  function finish() {
    Alert.alert(t('Terminer le match'), t('Le score sera figé et le match marqué comme terminé.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Terminer'),
        style: 'destructive',
        onPress: async () => {
          const next: Board = { ...frozen(board), status: 'finished' };
          setBoard(next);
          await persist(next);
          addMatchEvent({ match_id: id, kind: 'info', label: 'Fin du match' }).catch(() => {});
          goBack();
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
            <Pressable onPress={() => goBack()}>
              <Ionicons name="chevron-back" size={24} color={C.muted} />
            </Pressable>
          }
        />
        <Empty icon="radio-outline" title={loading ? t('Chargement…') : t('Match introuvable')} />
      </Screen>
    );
  }

  const qLabel =
    board.current <= 4
      ? t('{n}e quart-temps', { n: board.current })
      : t('Prolongation {n}', { n: board.current - 4 });
  const allowed = timeoutsAllowed(board.current);

  return (
    <Screen>
      <Header
        title={t('Table de marque')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pill
            label={board.status === 'finished' ? t('Terminé') : 'LIVE'}
            tone={board.status === 'finished' ? 'neutral' : 'red'}
            dot={board.status !== 'finished'}
          />
        }
      />

      <View style={{ padding: S.lg }}>
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: R.lg,
            borderWidth: 1,
            borderColor: C.border,
            padding: 14,
          }}>
          <Row style={{ justifyContent: 'space-around', alignItems: 'center' }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Crest
                label={teamShort(m.home_team)}
                color={m.home_team?.color ?? C.surface2}
                size={44}
                image={m.home_team?.logo_url}
              />
              <Text style={{ color: C.text, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {m.home_team?.name}
              </Text>
            </View>
            <Text
              style={{
                color: '#fff',
                fontSize: 34,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
                paddingHorizontal: 8,
              }}>
              {totals.home}-{totals.away}
            </Text>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Crest
                label={teamShort(m.away_team)}
                color={m.away_team?.color ?? C.surface2}
                size={44}
                image={m.away_team?.logo_url}
              />
              <Text style={{ color: C.text, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {m.away_team?.name}
              </Text>
            </View>
          </Row>

          {/* Chronomètre : l'élément que la table regarde en permanence. */}
          <Pressable
            onPress={toggleClock}
            style={({ pressed }) => [
              {
                marginTop: 12,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: R.md,
                borderWidth: 1,
                borderColor: board.clockRunning ? 'rgba(226,59,59,0.5)' : C.borderStrong,
                backgroundColor: board.clockRunning ? C.redSoft : 'transparent',
              },
              pressed && { opacity: 0.85 },
            ]}>
            <Text
              style={{
                color: board.clockRunning ? C.red : C.text,
                fontSize: 44,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
                letterSpacing: 1,
              }}>
              {formatClock(shown)}
            </Text>
            <Row style={{ gap: 6, marginTop: 2 }}>
              <Ionicons
                name={board.clockRunning ? 'pause' : 'play'}
                size={13}
                color={board.clockRunning ? C.red : C.accent}
              />
              <Text style={{ color: board.clockRunning ? C.red : C.accent, fontSize: 12, fontWeight: '600' }}>
                {board.clockRunning ? t('Arrêter le chrono') : t('Lancer le chrono')}
              </Text>
            </Row>
          </Pressable>

          <Text style={{ color: C.accent, fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '500' }}>
            {qLabel}
          </Text>
          <Text
            style={{
              color: err ? C.red : savedAt ? C.green : C.dim,
              fontSize: 11,
              textAlign: 'center',
              marginTop: 4,
            }}>
            {err
              ? t('Erreur : {msg}', { msg: err })
              : savedAt
                ? t('Enregistré ✓')
                : t('Les changements sont enregistrés automatiquement')}
          </Text>
        </View>

        {/* Fautes et temps morts, côte à côte comme sur une vraie table. */}
        <Row style={{ gap: 12, marginTop: S.md, alignItems: 'flex-start' }}>
          <TeamBoard
            label={teamShort(m.home_team)}
            fouls={board.fouls.home}
            timeouts={board.timeouts.home}
            allowed={allowed}
            onFoul={(n) => addFoul('home', n)}
            onTimeout={() => takeTimeout('home')}
          />
          <TeamBoard
            label={teamShort(m.away_team)}
            fouls={board.fouls.away}
            timeouts={board.timeouts.away}
            allowed={allowed}
            onFoul={(n) => addFoul('away', n)}
            onTimeout={() => takeTimeout('away')}
          />
        </Row>

        <Row style={{ gap: 12, marginTop: S.md, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TeamPad
              label={teamShort(m.home_team)}
              onAdd={(n) => addPoints('home', n)}
              onSub={() => addPoints('home', -1)}
            />
            <ScorerPicker
              roster={homeRoster.data ?? []}
              value={scorer.home}
              onChange={(v) => setScorer((s) => ({ ...s, home: v }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TeamPad
              label={teamShort(m.away_team)}
              onAdd={(n) => addPoints('away', n)}
              onSub={() => addPoints('away', -1)}
            />
            <ScorerPicker
              roster={awayRoster.data ?? []}
              value={scorer.away}
              onChange={(v) => setScorer((s) => ({ ...s, away: v }))}
            />
          </View>
        </Row>

        <Pressable
          onPress={nextQuarter}
          style={{
            marginTop: S.lg,
            backgroundColor: C.surface2,
            borderRadius: R.md,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: C.border,
          }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '500' }}>{t('Quart-temps suivant →')}</Text>
        </Pressable>
        <Pressable
          onPress={finish}
          style={{
            marginTop: 10,
            borderRadius: R.md,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(226,59,59,0.5)',
          }}>
          <Text style={{ color: C.red, fontSize: 15, fontWeight: '500' }}>{t('Terminer le match')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

/** Fautes d'équipe et temps morts d'une équipe. */
function TeamBoard({
  label,
  fouls,
  timeouts,
  allowed,
  onFoul,
  onTimeout,
}: {
  label: string;
  fouls: number;
  timeouts: number;
  allowed: number;
  onFoul: (n: number) => void;
  onTimeout: () => void;
}) {
  const { t } = useT();
  const bonus = fouls >= BONUS_FOULS;
  const noneLeft = timeouts >= allowed;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.surface,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: bonus ? 'rgba(226,59,59,0.45)' : C.border,
        padding: 11,
        gap: 9,
      }}>
      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', fontWeight: '600' }}>{label}</Text>

      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: C.dim, fontSize: 10.5 }}>{t('Fautes d’équipe')}</Text>
        <Text
          style={{
            color: bonus ? C.red : C.text,
            fontSize: 26,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}>
          {fouls}
        </Text>
        {bonus ? (
          <Text style={{ color: C.red, fontSize: 10, fontWeight: '700' }}>{t('BONUS')}</Text>
        ) : (
          <Text style={{ color: C.dim, fontSize: 10 }}>{t('bonus à {n}', { n: BONUS_FOULS })}</Text>
        )}
      </View>

      <Row style={{ gap: 6 }}>
        <SmallBtn label="−" onPress={() => onFoul(-1)} />
        <SmallBtn label="+1" onPress={() => onFoul(1)} accent />
      </Row>

      <Pressable
        onPress={onTimeout}
        disabled={noneLeft}
        style={({ pressed }) => [
          {
            borderRadius: R.sm,
            paddingVertical: 9,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: noneLeft ? C.border : C.borderStrong,
            opacity: noneLeft ? 0.45 : 1,
          },
          pressed && { opacity: 0.8 },
        ]}>
        <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '600' }}>
          {t('Temps mort')} {timeouts}/{allowed}
        </Text>
      </Pressable>
    </View>
  );
}

function SmallBtn({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          borderRadius: R.sm,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor: accent ? C.surface2 : 'transparent',
          borderWidth: 1,
          borderColor: C.border,
        },
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={{ color: accent ? C.text : C.dim, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

// Sélecteur de marqueur : le prochain panier — ou la prochaine faute — sera
// attribué au joueur choisi.
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
      <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 8, fontWeight: '500' }}>
        {label}
      </Text>
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
        style={{
          marginTop: 8,
          borderRadius: R.md,
          paddingVertical: 10,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: C.border,
        }}>
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
        {
          flex: 1,
          backgroundColor: C.surface2,
          borderRadius: R.md,
          paddingVertical: 14,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: C.border,
        },
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
