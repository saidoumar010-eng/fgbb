import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';

import { HeadToHead } from '@/components/head-to-head';
import { MatchFeed } from '@/components/match-feed';
import { MvpCard } from '@/components/mvp-card';
import { PredictionCard } from '@/components/prediction-card';
import { VideoEmbed } from '@/components/video-embed';
import { Card, Crest, Empty, Header, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getMatch, getMatchStats } from '@/lib/db';
import { fullDate, teamShort } from '@/lib/format';
import { useMatchRealtime } from '@/lib/realtime';
import { C, S } from '@/lib/theme';
import type { MatchStatus, PlayerMatchStat, QuarterScore } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useFetch(() => getMatch(id), [id]);
  const stats = useFetch(() => getMatchStats(id), [id]);
  const [tab, setTab] = useState<'fil' | 'box' | 'team' | null>(null);

  const m = match.data;
  const [overlay, setOverlay] = useState<{
    home_score: number;
    away_score: number;
    current_quarter: number | null;
    quarter_scores: QuarterScore[];
    status: MatchStatus;
  } | null>(null);
  useMatchRealtime(id, (row) =>
    setOverlay({
      home_score: Number(row.home_score),
      away_score: Number(row.away_score),
      current_quarter: row.current_quarter == null ? null : Number(row.current_quarter),
      quarter_scores: (row.quarter_scores as QuarterScore[]) ?? [],
      status: row.status as MatchStatus,
    }),
  );
  const homeScore = overlay?.home_score ?? m?.home_score ?? 0;
  const awayScore = overlay?.away_score ?? m?.away_score ?? 0;
  const dispStatus: MatchStatus = overlay?.status ?? m?.status ?? 'scheduled';
  const dispQuarters = overlay?.quarter_scores ?? m?.quarter_scores ?? [];

  async function shareMatch() {
    if (!m) return;
    const line =
      dispStatus === 'scheduled'
        ? `${m.home_team?.name} vs ${m.away_team?.name}`
        : `${m.home_team?.name} ${homeScore} – ${awayScore} ${m.away_team?.name}`;
    const comp = m.competition?.name ? ` · ${m.competition.name}` : '';
    await Share.share({ message: `🏀 ${line}${comp}\nSuivez le basket guinéen sur l'application FGBB.` });
  }

  const allStats = stats.data ?? [];
  const homeStats = allStats.filter((s) => s.team_id === m?.home_team_id);
  const awayStats = allStats.filter((s) => s.team_id === m?.away_team_id);

  // Match avec le statut « live » superposé (temps réel) pour les sous-composants.
  const mm = m ? { ...m, status: dispStatus } : undefined;
  // Onglet par défaut selon le contexte : fil en direct, box score après, équipes avant.
  const activeTab = tab ?? (dispStatus === 'live' ? 'fil' : dispStatus === 'finished' ? 'box' : 'team');

  return (
    <Screen>
      <Header
        title="Match"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Row style={{ gap: 14, alignItems: 'center' }}>
            {dispStatus === 'live' ? <Pill label="DIRECT" tone="red" dot /> : null}
            <Ionicons name="share-social-outline" size={22} color={C.muted} onPress={shareMatch} />
          </Row>
        }
      />

      {!m ? (
        <Empty icon="basketball-outline" title={match.loading ? 'Chargement…' : 'Match introuvable'} />
      ) : (
        <View>
          <View style={{ padding: S.lg }}>
            <Card>
              <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
                {m.competition?.name ?? 'Match'} {m.venue ? `· ${m.venue}` : ''}
              </Text>
              <Row style={{ justifyContent: 'space-around' }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Crest label={teamShort(m.home_team)} color={m.home_team?.color ?? C.surface2} size={48} />
                  <Text style={{ color: C.text, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    {m.home_team?.name}
                  </Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '600', paddingHorizontal: 6 }}>
                  {dispStatus === 'scheduled' ? 'vs' : `${homeScore}-${awayScore}`}
                </Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Crest label={teamShort(m.away_team)} color={m.away_team?.color ?? C.surface2} size={48} />
                  <Text style={{ color: C.text, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    {m.away_team?.name}
                  </Text>
                </View>
              </Row>
              {m.scheduled_at ? (
                <Text style={{ color: C.accent, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                  {fullDate(m.scheduled_at)}
                </Text>
              ) : null}

              {dispQuarters.length > 0 && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 }}>
                  <Row style={{ paddingVertical: 6 }}>
                    <Text style={[qc, { flex: 1, textAlign: 'left' }]}> </Text>
                    {dispQuarters.map((q) => (
                      <Text key={q.q} style={qc}>{`Q${q.q}`}</Text>
                    ))}
                  </Row>
                  <Row style={{ paddingVertical: 4 }}>
                    <Text style={[qc, { flex: 1, textAlign: 'left', color: C.text }]}>{teamShort(m.home_team)}</Text>
                    {dispQuarters.map((q) => (
                      <Text key={q.q} style={[qc, { color: C.text }]}>{q.home}</Text>
                    ))}
                  </Row>
                  <Row style={{ paddingVertical: 4 }}>
                    <Text style={[qc, { flex: 1, textAlign: 'left', color: C.text }]}>{teamShort(m.away_team)}</Text>
                    {dispQuarters.map((q) => (
                      <Text key={q.q} style={[qc, { color: C.text }]}>{q.away}</Text>
                    ))}
                  </Row>
                </View>
              )}
            </Card>
          </View>

          <View style={{ paddingHorizontal: S.lg, marginTop: 2 }}>
            <PredictionCard match={mm!} />
          </View>

          {m.video_url ? (
            <>
              <SectionTitle title="Résumé vidéo" />
              <View style={{ paddingHorizontal: S.lg }}>
                <VideoEmbed url={m.video_url} />
              </View>
            </>
          ) : null}

          <Row style={{ marginHorizontal: S.lg, marginTop: S.lg, gap: 6 }}>
            <SubTab label="Fil" active={activeTab === 'fil'} onPress={() => setTab('fil')} />
            <SubTab label="Box score" active={activeTab === 'box'} onPress={() => setTab('box')} />
            <SubTab label="Équipes" active={activeTab === 'team'} onPress={() => setTab('team')} />
          </Row>

          {activeTab === 'fil' ? (
            <MatchFeed match={mm!} />
          ) : activeTab === 'box' ? (
            allStats.length === 0 ? (
              <Empty
                icon="stats-chart-outline"
                title="Pas encore de statistiques"
                subtitle="Les stats joueur par joueur seront saisies par la fédération."
              />
            ) : (
              <View style={{ paddingHorizontal: S.lg, paddingTop: 12, gap: 16 }}>
                <BoxScore title={m.home_team?.name ?? ''} rows={homeStats} />
                <BoxScore title={m.away_team?.name ?? ''} rows={awayStats} />
              </View>
            )
          ) : (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12, gap: 12 }}>
              {allStats.length > 0 && (
                <TeamCompare home={homeStats} away={awayStats} homeName={teamShort(m.home_team)} awayName={teamShort(m.away_team)} />
              )}
              <HeadToHead match={mm!} />
            </View>
          )}

          {dispStatus !== 'scheduled' && (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg }}>
              <MvpCard match={mm!} />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: active ? C.surface2 : C.surface,
        borderWidth: 1,
        borderColor: active ? 'rgba(59,214,27,0.5)' : 'transparent',
      }}>
      <Text style={{ color: active ? '#fff' : C.muted, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}

function BoxScore({ title, rows }: { title: string; rows: PlayerMatchStat[] }) {
  return (
    <View>
      <Text style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>{title}</Text>
      <Card style={{ paddingVertical: 6, paddingHorizontal: 11 }}>
        <Row style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={[bh, { flex: 1, textAlign: 'left' }]}>Joueur</Text>
          <Text style={bh}>PTS</Text>
          <Text style={bh}>REB</Text>
          <Text style={bh}>PD</Text>
          <Text style={bh}>INT</Text>
        </Row>
        {rows.map((s, i) => (
          <Pressable key={s.id} onPress={() => s.player && router.push(`/player/${s.player.id}`)}>
            <Row style={{ paddingVertical: 8, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 12.5 }} numberOfLines={1}>
                {s.player?.full_name ?? '—'}
              </Text>
              <Text style={bc}>{s.points}</Text>
              <Text style={bc}>{s.rebounds}</Text>
              <Text style={bc}>{s.assists}</Text>
              <Text style={bc}>{s.steals}</Text>
            </Row>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function sum(rows: PlayerMatchStat[], key: keyof PlayerMatchStat) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
}

function TeamCompare({
  home,
  away,
  homeName,
  awayName,
}: {
  home: PlayerMatchStat[];
  away: PlayerMatchStat[];
  homeName: string;
  awayName: string;
}) {
  const line = (label: string, h: string | number, a: string | number) => (
    <Row style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ flex: 1, color: C.text, fontSize: 12.5 }}>{label}</Text>
      <Text style={{ width: 60, textAlign: 'center', color: C.muted, fontSize: 12.5 }}>{h}</Text>
      <Text style={{ width: 60, textAlign: 'center', color: C.muted, fontSize: 12.5 }}>{a}</Text>
    </Row>
  );
  const pct = (rows: PlayerMatchStat[]) => {
    const made = sum(rows, 'fg_made');
    const att = sum(rows, 'fg_att');
    return att > 0 ? `${Math.round((100 * made) / att)}%` : '—';
  };
  return (
    <Card style={{ paddingVertical: 6, paddingHorizontal: 13 }}>
      <Row style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ flex: 1, color: C.dim, fontSize: 11 }}>Stat</Text>
        <Text style={{ width: 60, textAlign: 'center', color: C.dim, fontSize: 11 }}>{homeName}</Text>
        <Text style={{ width: 60, textAlign: 'center', color: C.dim, fontSize: 11 }}>{awayName}</Text>
      </Row>
      {line('Rebonds', sum(home, 'rebounds'), sum(away, 'rebounds'))}
      {line('Passes décisives', sum(home, 'assists'), sum(away, 'assists'))}
      {line('Interceptions', sum(home, 'steals'), sum(away, 'steals'))}
      {line('Contres', sum(home, 'blocks'), sum(away, 'blocks'))}
      {line('% aux tirs', pct(home), pct(away))}
    </Card>
  );
}

const qc = { width: 34, textAlign: 'center' as const, color: C.dim, fontSize: 12, fontWeight: '500' as const };
const bh = { width: 38, textAlign: 'center' as const, color: C.dim, fontSize: 11, fontWeight: '500' as const };
const bc = { width: 38, textAlign: 'center' as const, color: C.muted, fontSize: 12.5 };
