import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import {
  banUser,
  listBans,
  listModerationQueue,
  resolveReportsFor,
  setContentStatus,
  timeAgo,
  unbanUser,
} from '@/lib/db-community';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { ModerationRow } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Tab = 'reports' | 'bans';

/** Durées proposées à l'admin ; null = bannissement définitif. */
const DURATIONS: { label: string; hours: number | null }[] = [
  { label: '24 h', hours: 24 },
  { label: '7 jours', hours: 24 * 7 },
  { label: 'Définitif', hours: null },
];

function untilFrom(hours: number | null) {
  return hours === null ? null : new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

export default function AdminModeration() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('reports');
  const queue = useFetch(() => listModerationQueue());
  const bans = useFetch(() => listBans());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [banning, setBanning] = useState<ModerationRow | null>(null);

  // Un message très signalé remonte autant de fois qu'il a de signalements :
  // on n'en garde qu'une fiche, le compte total est déjà porté par `reports`.
  const rows = useMemo(() => {
    const seen = new Map<string, ModerationRow>();
    for (const r of queue.data ?? []) {
      const key = `${r.target_type}:${r.target_id}`;
      if (!seen.has(key)) seen.set(key, r);
    }
    return [...seen.values()];
  }, [queue.data]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setErr(null);
    try {
      await action();
      await queue.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Erreur'));
    } finally {
      setBusy(null);
    }
  }

  function hide(r: ModerationRow) {
    run(`hide:${r.report_id}`, async () => {
      await setContentStatus(r.target_type, r.target_id, 'hidden');
      await resolveReportsFor(r.target_type, r.target_id);
    });
  }

  function ignore(r: ModerationRow) {
    run(`ignore:${r.report_id}`, () => resolveReportsFor(r.target_type, r.target_id));
  }

  async function ban(hours: number | null) {
    const target = banning;
    setBanning(null);
    if (!target?.author_id) return;
    await run(`ban:${target.report_id}`, async () => {
      await banUser(target.author_id as string, target.reason, untilFrom(hours));
      // Bannir sans masquer laisserait le message litigieux en ligne.
      await setContentStatus(target.target_type, target.target_id, 'hidden');
      await resolveReportsFor(target.target_type, target.target_id);
    });
    await bans.reload();
  }

  function confirmUnban(userId: string) {
    Alert.alert(t('Débloquer ce compte'), t('Le supporter pourra de nouveau publier des messages.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Débloquer'),
        onPress: async () => {
          await unbanUser(userId).catch(() => {});
          bans.reload();
        },
      },
    ]);
  }

  const banCount = (bans.data ?? []).length;

  return (
    <Screen>
      <Header
        title={t('Modération')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/moderation-words' as never)}>
            <Ionicons name="filter-outline" size={22} color={C.accent} />
          </Pressable>
        }
      />

      <Row style={{ gap: 8, padding: S.lg, paddingBottom: S.sm }}>
        {(
          [
            ['reports', t('Signalements'), rows.length],
            ['bans', t('Comptes bannis'), banCount],
          ] as const
        ).map(([key, label, n]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={{
                backgroundColor: on ? C.accent : C.chipBg,
                borderRadius: R.pill,
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}>
              <Text style={{ color: on ? C.accentText : C.muted, fontSize: 12, fontWeight: '600' }}>
                {n > 0 ? `${label} (${n})` : label}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {err ? (
        <Text style={{ color: C.red, fontSize: 12.5, paddingHorizontal: S.lg }}>{err}</Text>
      ) : null}

      {tab === 'reports' ? (
        <View style={{ padding: S.lg, gap: 12 }}>
          {rows.length === 0 ? (
            <Empty
              icon="shield-checkmark-outline"
              title={queue.loading ? t('Chargement…') : t('Aucun signalement')}
              subtitle={queue.loading ? undefined : t('Les messages signalés par les supporters apparaîtront ici.')}
            />
          ) : (
            rows.map((r) => (
              <Card key={r.report_id}>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Row style={{ gap: 6, flex: 1 }}>
                    <Pill label={r.target_type === 'chat' ? t('Chat') : t('Commentaire')} tone="neutral" />
                    {r.reports > 1 && <Pill label={t('{n} signalements', { n: r.reports })} tone="red" />}
                    {r.status === 'hidden' && <Pill label={t('Masqué')} tone="red" />}
                  </Row>
                  <Text style={{ color: C.dim, fontSize: 11 }}>{timeAgo(r.reported_at, t)}</Text>
                </Row>

                <Text style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>
                  {r.author_name ?? t('Auteur inconnu')}
                  {r.reason ? ` · ${t('Motif')} : ${t(r.reason)}` : ''}
                </Text>
                <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>
                  {r.body ?? t('Message supprimé')}
                </Text>

                <Row style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  {r.status !== 'hidden' && r.body !== null && (
                    <Pressable onPress={() => hide(r)} disabled={!!busy}>
                      <Text style={{ color: C.red, fontSize: 12.5 }}>{t('Masquer le message')}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => ignore(r)} disabled={!!busy}>
                    <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Ignorer le signalement')}</Text>
                  </Pressable>
                  {r.author_id && (
                    <Pressable onPress={() => setBanning(r)} disabled={!!busy}>
                      <Text style={{ color: C.accent, fontSize: 12.5 }}>{t('Bannir l’auteur')}</Text>
                    </Pressable>
                  )}
                </Row>
              </Card>
            ))
          )}
        </View>
      ) : (
        <View style={{ padding: S.lg, gap: 12 }}>
          {banCount === 0 ? (
            <Empty
              icon="people-outline"
              title={bans.loading ? t('Chargement…') : t('Aucun compte banni')}
              subtitle={bans.loading ? undefined : t('Les supporters exclus du chat apparaîtront ici.')}
            />
          ) : (
            (bans.data ?? []).map((b) => (
              <Card key={b.user_id}>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1 }}>
                    {t('Compte {id}', { id: b.user_id.slice(0, 8) })}
                  </Text>
                  <Pill
                    label={b.until ? t('Jusqu’au {date}', { date: fullDate(b.until) }) : t('Définitif')}
                    tone={b.until ? 'neutral' : 'red'}
                  />
                </Row>
                <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>
                  {b.reason ? t(b.reason) : t('Sans motif')} · {timeAgo(b.created_at, t)}
                </Text>
                <Pressable onPress={() => confirmUnban(b.user_id)} style={{ marginTop: 10 }}>
                  <Text style={{ color: C.accent, fontSize: 12.5 }}>{t('Débloquer')}</Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      )}

      <Modal visible={!!banning} transparent animationType="fade" onRequestClose={() => setBanning(null)}>
        <Pressable
          onPress={() => setBanning(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          {/* onPress vide : sans lui, le panneau ne capte pas le toucher et le fond le referme. */}
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: C.surface,
              borderTopLeftRadius: R.xl,
              borderTopRightRadius: R.xl,
              padding: S.lg,
            }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Bannir l’auteur')}</Text>
            <Text style={{ color: C.dim, fontSize: 12, marginTop: 4, marginBottom: 8 }}>
              {t('Le message sera masqué et le supporter ne pourra plus publier.')}
            </Text>
            {DURATIONS.map((d) => (
              <Pressable
                key={d.label}
                onPress={() => ban(d.hours)}
                style={({ pressed }) => [
                  { paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.border },
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={{ color: d.hours === null ? C.red : C.text, fontSize: 14 }}>{t(d.label)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setBanning(null)} style={{ paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontSize: 14 }}>{t('Annuler')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
