import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, getLeaderboard, getMyFanStats, setLeaderboardVisibility } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { LeaderboardRow } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Barème appliqué par la fonction SQL fan_points_raw().
const SCORING: { icon: keyof typeof Ionicons.glyphMap; label: string; points: string }[] = [
  { icon: 'trophy-outline', label: 'Pronostic gagnant', points: '+3' },
  { icon: 'game-controller-outline', label: 'Pronostic joué', points: '+1' },
  { icon: 'help-circle-outline', label: 'Bonne réponse de quiz', points: '+1' },
  { icon: 'star-outline', label: 'Vote MVP', points: '+1' },
];

export default function FanLeaderboardScreen() {
  const { t } = useT();
  const { session, profile, refreshProfile } = useAuth();
  const uid = session?.user.id;
  const board = useFetch(() => getLeaderboard(50));
  const stats = useFetch(() => (uid ? getMyFanStats() : Promise.resolve(null)), [uid]);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = board.data ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const me = stats.data;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([board.reload(), stats.reload()]);
    setRefreshing(false);
  };

  async function toggleVisibility(visible: boolean) {
    if (!uid || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await setLeaderboardVisibility(uid, visible);
      await refreshProfile();
      await board.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Impossible de modifier ce réglage.')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Classement des supporters')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        {rows.length === 0 ? (
          <Empty
            icon="trophy-outline"
            title={board.loading ? t('Chargement…') : t('Classement vide')}
            subtitle={board.loading ? undefined : t('Pronostique, vote et joue aux quiz pour ouvrir le classement.')}
          />
        ) : (
          <Podium rows={podium} />
        )}

        {session ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{t('Mes points')}</Text>
              <Text style={{ color: C.accent, fontSize: 20, fontWeight: '700' }}>{me?.points ?? 0}</Text>
            </Row>
            <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
              {me?.position_no
                ? t('Tu es {n}e du classement général.', { n: me.position_no })
                : t('Marque tes premiers points pour entrer au classement.')}
            </Text>
            <View style={{ gap: 8, marginTop: S.md }}>
              <StatLine label={t('Pronostics joués')} value={me?.predictions ?? 0} />
              <StatLine label={t('Pronostics gagnés')} value={me?.correct ?? 0} accent />
              <StatLine label={t('Points de quiz')} value={me?.quiz_points ?? 0} />
              <StatLine label={t('Votes MVP')} value={me?.mvp_votes ?? 0} />
            </View>
            <Row style={{ justifyContent: 'space-between', gap: 12, marginTop: S.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13 }}>{t('Apparaître dans le classement public')}</Text>
                <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>
                  {t('Tes points restent comptabilisés même si tu te retires.')}
                </Text>
              </View>
              <Switch
                value={profile?.show_in_leaderboard ?? true}
                onValueChange={toggleVisibility}
                disabled={saving}
                trackColor={{ false: C.surface2, true: C.accentSoft }}
                thumbColor={profile?.show_in_leaderboard ?? true ? C.accent : C.dim}
              />
            </Row>
            {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          </Card>
        ) : (
          <Pressable onPress={() => router.push('/login')} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
            <Card style={{ borderColor: 'rgba(59,214,27,0.35)' }}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>
                {t('Connecte-toi pour marquer des points')}
              </Text>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                {t('Pronostics, votes MVP et quiz alimentent ton total.')}
              </Text>
            </Card>
          </Pressable>
        )}

        <Card>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{t('Comment gagner des points')}</Text>
          <View style={{ gap: 9, marginTop: S.md }}>
            {SCORING.map((s) => (
              <Row key={s.label} style={{ gap: 10 }}>
                <Ionicons name={s.icon} size={16} color={C.accent} />
                <Text style={{ color: C.muted, fontSize: 13, flex: 1 }}>{t(s.label)}</Text>
                <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>
                  {t('{n} pts', { n: s.points })}
                </Text>
              </Row>
            ))}
          </View>
          <Row style={{ gap: 10, marginTop: S.md }}>
            <Pressable onPress={() => router.push('/quiz')}>
              <Row
                style={{
                  gap: 7,
                  borderWidth: 1,
                  borderColor: 'rgba(59,214,27,0.4)',
                  borderRadius: R.md,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}>
                <Ionicons name="help-circle-outline" size={16} color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{t('Jouer à un quiz')}</Text>
              </Row>
            </Pressable>
          </Row>
        </Card>

        {rest.length > 0 && (
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {rest.map((r, i) => (
              <BoardRow key={`${r.position_no}-${r.name}`} row={r} last={i === rest.length - 1} />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

function StatLine({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: accent ? C.accent : C.text, fontSize: 14, fontWeight: '600' }}>{value}</Text>
    </Row>
  );
}

// Podium : le 1er au centre et plus haut, comme sur une remise de trophées.
function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const { t } = useT();
  const first = rows[0];
  const second = rows[1];
  const third = rows[2];
  if (!first) return null;

  const step = (row: LeaderboardRow | undefined, height: number, color: string, size: number) => {
    if (!row) return <View style={{ flex: 1 }} />;
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: 7 }}>
        <Crest
          label={row.name.slice(0, 2).toUpperCase()}
          color={row.is_me ? C.accent : C.surface2}
          size={size}
          round
        />
        <Text
          style={{ color: row.is_me ? C.accent : C.text, fontSize: 12.5, fontWeight: '600' }}
          numberOfLines={1}>
          {row.is_me ? t('Toi') : row.name}
        </Text>
        <View
          style={{
            width: '100%',
            height,
            borderTopLeftRadius: R.sm,
            borderTopRightRadius: R.sm,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}>
          <Text style={{ color: C.bg, fontSize: 17, fontWeight: '700' }}>{row.position_no}</Text>
          <Text style={{ color: C.bg, fontSize: 11, fontWeight: '600' }}>
            {t('{n} pts', { n: row.points })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Card style={{ paddingBottom: 0 }}>
      <Row style={{ gap: 8, alignItems: 'flex-end' }}>
        {step(second, 56, C.muted, 38)}
        {step(first, 78, C.flagYellow, 46)}
        {step(third, 42, C.flagRed, 34)}
      </Row>
    </Card>
  );
}

function BoardRow({ row, last }: { row: LeaderboardRow; last: boolean }) {
  const { t } = useT();
  return (
    <Row
      style={{
        paddingVertical: 11,
        paddingHorizontal: row.is_me ? 8 : 0,
        marginVertical: row.is_me ? 4 : 0,
        gap: 12,
        borderRadius: row.is_me ? R.sm : 0,
        backgroundColor: row.is_me ? C.accentSoft : 'transparent',
        borderBottomWidth: last || row.is_me ? 0 : 1,
        borderBottomColor: C.border,
      }}>
      <Text style={{ color: row.is_me ? C.accent : C.dim, fontSize: 14, fontWeight: '600', width: 26 }}>
        {row.position_no}
      </Text>
      <Crest
        label={row.name.slice(0, 2).toUpperCase()}
        color={row.is_me ? C.accent : C.surface2}
        size={30}
        round
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: row.is_me ? C.accent : C.text, fontSize: 14 }} numberOfLines={1}>
          {row.is_me ? t('Toi') : row.name}
        </Text>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>
          {t('{correct} pronostics gagnés sur {played}', { correct: row.correct, played: row.predictions })}
        </Text>
      </View>
      <Text style={{ color: row.is_me ? C.accent : C.text, fontSize: 15, fontWeight: '700' }}>
        {row.points}
      </Text>
    </Row>
  );
}
