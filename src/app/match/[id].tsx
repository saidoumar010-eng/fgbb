import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Comments } from '@/components/comments';
import { HeadToHead } from '@/components/head-to-head';
import { LiveChat } from '@/components/live-chat';
import { LiveScoreboard } from '@/components/live-scoreboard';
import { MatchFeed } from '@/components/match-feed';
import { MatchOfficials } from '@/components/match-officials';
import { MvpCard } from '@/components/mvp-card';
import { PhotoGallery } from '@/components/photo-gallery';
import { PredictionCard } from '@/components/prediction-card';
import { ShareCardModal } from '@/components/share-card-modal';
import { ShotChart } from '@/components/shot-chart';
import { SponsorBand } from '@/components/sponsor-band';
import { VideoEmbed } from '@/components/video-embed';
import {
  Card,
  Crest,
  Empty,
  Header,
  OfflineNotice,
  Pill,
  Row,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { getMatch, getMatchStats } from '@/lib/db';
import { exportMatchSheetPdf } from '@/lib/export';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useMatchRealtime } from '@/lib/realtime';
import { cancelReminder, getReminder, REMINDER_LEAD_MINUTES, remindersSupported, setReminder } from '@/lib/reminders';
import { C, R, S } from '@/lib/theme';
import type { MatchStatus, PlayerMatchStat, QuarterScore } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Tab = 'fil' | 'box' | 'team' | 'chat' | 'reactions';

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const match = useFetch(() => getMatch(id), [id], { cacheKey: `match:${id}` });
  const stats = useFetch(() => getMatchStats(id), [id], { cacheKey: `match-stats:${id}` });
  const [tab, setTab] = useState<Tab | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const m = match.data;
  // La superposition porte tout ce que la table de marque peut changer en
  // direct : score, quart-temps, chrono, fautes et temps morts.
  const [overlay, setOverlay] = useState<{
    home_score: number;
    away_score: number;
    current_quarter: number | null;
    quarter_scores: QuarterScore[];
    status: MatchStatus;
    clock_seconds: number;
    clock_running: boolean;
    clock_updated_at: string | null;
    home_fouls: number;
    away_fouls: number;
    home_timeouts: number;
    away_timeouts: number;
  } | null>(null);
  useMatchRealtime(id, (row) =>
    setOverlay({
      home_score: Number(row.home_score),
      away_score: Number(row.away_score),
      current_quarter: row.current_quarter == null ? null : Number(row.current_quarter),
      quarter_scores: (row.quarter_scores as QuarterScore[]) ?? [],
      status: row.status as MatchStatus,
      clock_seconds: Number(row.clock_seconds ?? 600),
      clock_running: !!row.clock_running,
      clock_updated_at: (row.clock_updated_at as string | null) ?? null,
      home_fouls: Number(row.home_fouls ?? 0),
      away_fouls: Number(row.away_fouls ?? 0),
      home_timeouts: Number(row.home_timeouts ?? 0),
      away_timeouts: Number(row.away_timeouts ?? 0),
    }),
  );
  const homeScore = overlay?.home_score ?? m?.home_score ?? 0;
  const awayScore = overlay?.away_score ?? m?.away_score ?? 0;
  const dispStatus: MatchStatus = overlay?.status ?? m?.status ?? 'scheduled';
  const dispQuarters = overlay?.quarter_scores ?? m?.quarter_scores ?? [];
  const board = overlay ?? m;
  const dispQuarter = overlay?.current_quarter ?? m?.current_quarter ?? null;

  // Le partage passe par un aperçu : le supporter envoie une image à ses
  // contacts, il doit voir ce qui partira avant de l'envoyer.
  const [sharing, setSharing] = useState(false);

  // Rappel de match : notification locale programmée avant le coup d'envoi.
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!remindersSupported || !m?.id) return;
    let alive = true;
    getReminder(m.id).then((e) => {
      if (alive) setReminderOn(!!e);
    });
    return () => {
      alive = false;
    };
  }, [m?.id]);

  async function toggleReminder() {
    if (!m || reminderBusy) return;
    setReminderBusy(true);
    setReminderMsg(null);
    try {
      if (reminderOn) {
        await cancelReminder(m.id);
        setReminderOn(false);
        setReminderMsg(t('Rappel annulé.'));
      } else {
        const res = await setReminder(m);
        if (res.ok) {
          setReminderOn(true);
          setReminderMsg(t('Rappel programmé {n} min avant le coup d’envoi.', { n: REMINDER_LEAD_MINUTES }));
        } else {
          setReminderMsg(
            res.reason === 'denied'
              ? t('Autorise les notifications pour recevoir le rappel.')
              : res.reason === 'too_late'
                ? t('Ce match commence trop tôt pour programmer un rappel.')
                : res.reason === 'no_date'
                  ? t('L’heure du match n’est pas encore fixée.')
                  : t('Impossible de programmer le rappel pour le moment.'),
          );
        }
      }
    } finally {
      setReminderBusy(false);
    }
  }

  const allStats = stats.data ?? [];
  const homeStats = allStats.filter((s) => s.team_id === m?.home_team_id);
  const awayStats = allStats.filter((s) => s.team_id === m?.away_team_id);

  // Match avec le statut « live » superposé (temps réel) pour les sous-composants.
  const mm = m ? { ...m, status: dispStatus } : undefined;
  // Onglet par défaut selon le contexte : fil en direct, box score après, équipes avant.
  const activeTab: Tab = tab ?? (dispStatus === 'live' ? 'fil' : dispStatus === 'finished' ? 'box' : 'team');

  async function exportSheet() {
    setExportError(null);
    setExporting(true);
    try {
      await exportMatchSheetPdf(id);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t("Export impossible pour l'instant."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Header
        title={t('Match')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Row style={{ gap: 14, alignItems: 'center' }}>
            {dispStatus === 'live' ? <Pill label={t('DIRECT')} tone="red" dot /> : null}
            {dispStatus === 'finished' ? (
              <Ionicons
                name="document-text-outline"
                size={22}
                color={exporting ? C.dim : C.muted}
                onPress={exporting ? undefined : exportSheet}
              />
            ) : null}
            <Ionicons
              name="share-social-outline"
              size={22}
              color={C.muted}
              onPress={() => setSharing(true)}
            />
          </Row>
        }
      />

      {m ? (
        <ShareCardModal
          match={mm!}
          homeScore={homeScore}
          awayScore={awayScore}
          live={dispStatus === 'live'}
          visible={sharing}
          onClose={() => setSharing(false)}
        />
      ) : null}

      {!m ? (
        <Empty icon="basketball-outline" title={match.loading ? t('Chargement…') : t('Match introuvable')} />
      ) : (
        <View>
          {match.stale && <OfflineNotice cachedAt={match.cachedAt} onRetry={match.reload} />}
          <View style={{ padding: S.lg }}>
            <Card>
              <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
                {m.competition?.name ?? t('Match')} {m.venue ? `· ${m.venue}` : ''}
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

              {dispStatus === 'scheduled' && remindersSupported && m.scheduled_at ? (
                <View style={{ alignItems: 'center', marginTop: 12, gap: 6 }}>
                  <Pressable
                    onPress={reminderBusy ? undefined : toggleReminder}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 7,
                        borderWidth: 1,
                        borderRadius: R.pill,
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                        borderColor: reminderOn ? C.accent : C.borderStrong,
                        backgroundColor: reminderOn ? C.accentSoft : 'transparent',
                      },
                      (pressed || reminderBusy) && { opacity: 0.7 },
                    ]}>
                    {reminderBusy ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <Ionicons
                        name={reminderOn ? 'notifications' : 'notifications-outline'}
                        size={16}
                        color={reminderOn ? C.accent : C.muted}
                      />
                    )}
                    <Text style={{ color: reminderOn ? C.accent : C.text, fontSize: 13, fontWeight: '600' }}>
                      {reminderOn ? t('Rappel activé') : t('Me rappeler')}
                    </Text>
                  </Pressable>
                  {reminderMsg ? (
                    <Text style={{ color: C.dim, fontSize: 11.5, textAlign: 'center' }}>{reminderMsg}</Text>
                  ) : null}
                </View>
              ) : null}

              {dispStatus === 'live' && board ? (
                <LiveScoreboard
                  clock={{
                    clock_seconds: board.clock_seconds ?? 600,
                    clock_running: board.clock_running ?? false,
                    clock_updated_at: board.clock_updated_at ?? null,
                  }}
                  quarter={dispQuarter}
                  homeName={teamShort(m.home_team)}
                  awayName={teamShort(m.away_team)}
                  homeFouls={board.home_fouls ?? 0}
                  awayFouls={board.away_fouls ?? 0}
                  homeTimeouts={board.home_timeouts ?? 0}
                  awayTimeouts={board.away_timeouts ?? 0}
                />
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

          {exportError ? (
            <Text style={{ color: C.red, fontSize: 12, paddingHorizontal: S.lg, marginBottom: S.sm }}>
              {exportError}
            </Text>
          ) : null}

          <View style={{ paddingHorizontal: S.lg }}>
            <MatchOfficials matchId={id} />
          </View>

          <View style={{ paddingHorizontal: S.lg, marginTop: 2 }}>
            <PredictionCard match={mm!} />
          </View>

          {m.video_url ? (
            <>
              <SectionTitle title={t('Résumé vidéo')} />
              <View style={{ paddingHorizontal: S.lg }}>
                <VideoEmbed url={m.video_url} />
              </View>
            </>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: S.lg, gap: 6, marginTop: S.lg }}>
            <SubTab label={t('Fil')} active={activeTab === 'fil'} onPress={() => setTab('fil')} />
            <SubTab label={t('Box score')} active={activeTab === 'box'} onPress={() => setTab('box')} />
            <SubTab label={t('Équipes')} active={activeTab === 'team'} onPress={() => setTab('team')} />
            {dispStatus !== 'scheduled' ? (
              <SubTab label={t('Chat')} active={activeTab === 'chat'} onPress={() => setTab('chat')} />
            ) : null}
            <SubTab label={t('Réactions')} active={activeTab === 'reactions'} onPress={() => setTab('reactions')} />
          </ScrollView>

          {activeTab === 'chat' ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12 }}>
              <LiveChat match={mm!} />
            </View>
          ) : activeTab === 'reactions' ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12 }}>
              <Comments targetType="match" targetId={id} />
            </View>
          ) : activeTab === 'fil' ? (
            <MatchFeed match={mm!} />
          ) : activeTab === 'box' ? (
            allStats.length === 0 ? (
              <Empty
                icon="stats-chart-outline"
                title={t('Pas encore de statistiques')}
                subtitle={t('Les stats joueur par joueur seront saisies par la fédération.')}
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
            <>
              <SectionTitle title={t('Carte des tirs')} />
              <View style={{ paddingHorizontal: S.lg }}>
                <ShotChart matchId={id} />
              </View>
            </>
          )}

          <PhotoGallery matchId={id} />

          {dispStatus !== 'scheduled' && (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg }}>
              <MvpCard match={mm!} />
            </View>
          )}

          <View style={{ paddingTop: S.lg }}>
            <SponsorBand placement="match" />
          </View>
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
  const { t } = useT();
  return (
    <View>
      <Text style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>{title}</Text>
      <Card style={{ paddingVertical: 6, paddingHorizontal: 11 }}>
        <Row style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={[bh, { flex: 1, textAlign: 'left' }]}>{t('Joueur')}</Text>
          <Text style={bh}>{t('PTS')}</Text>
          <Text style={bh}>{t('REB')}</Text>
          <Text style={bh}>{t('PD')}</Text>
          <Text style={bh}>{t('INT')}</Text>
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
  const { t } = useT();
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
        <Text style={{ flex: 1, color: C.dim, fontSize: 11 }}>{t('Stat')}</Text>
        <Text style={{ width: 60, textAlign: 'center', color: C.dim, fontSize: 11 }}>{homeName}</Text>
        <Text style={{ width: 60, textAlign: 'center', color: C.dim, fontSize: 11 }}>{awayName}</Text>
      </Row>
      {line(t('Rebonds'), sum(home, 'rebounds'), sum(away, 'rebounds'))}
      {line(t('Passes décisives'), sum(home, 'assists'), sum(away, 'assists'))}
      {line(t('Interceptions'), sum(home, 'steals'), sum(away, 'steals'))}
      {line(t('Contres'), sum(home, 'blocks'), sum(away, 'blocks'))}
      {line(t('% aux tirs'), pct(home), pct(away))}
    </Card>
  );
}

const qc = { width: 34, textAlign: 'center' as const, color: C.dim, fontSize: 12, fontWeight: '500' as const };
const bh = { width: 38, textAlign: 'center' as const, color: C.dim, fontSize: 11, fontWeight: '500' as const };
const bc = { width: 38, textAlign: 'center' as const, color: C.muted, fontSize: 12.5 };
