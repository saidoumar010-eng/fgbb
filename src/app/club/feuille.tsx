import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Crest, Empty, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getClubRoster, listMyClubs } from '@/lib/db-club-space';
import { errorMessage } from '@/lib/db-fan';
import { getMatchLineup, saveMatchLineup, setLineupValidated } from '@/lib/db-matchday';
import { getTeamMatches } from '@/lib/db';
import { matchWhen, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Match, Player } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const MAX_PLAYERS = 12;

/**
 * Feuille de match numérique, côté club : le dirigeant retient jusqu'à 12
 * joueurs pour un match à venir puis valide. Une fois validée, la liste est
 * verrouillée ; la table technique la voit et clôt la feuille le jour du match.
 */
export default function ClubFeuilleScreen() {
  const { t } = useT();
  const { session } = useAuth();
  const clubs = useFetch(() => (session ? listMyClubs() : Promise.resolve([])), [session?.user.id]);
  const club = clubs.data?.[0];

  const matchesQ = useFetch(
    () => (club ? getTeamMatches(club.id) : Promise.resolve([] as Match[])),
    [club?.id],
  );
  const rosterQ = useFetch(
    () => (club ? getClubRoster(club.id) : Promise.resolve([] as Player[])),
    [club?.id],
  );

  const upcoming = useMemo(
    () => (matchesQ.data ?? []).filter((m) => m.status === 'scheduled'),
    [matchesQ.data],
  );

  const [matchId, setMatchId] = useState<string | null>(null);
  const lineupQ = useFetch(
    () => (matchId && club ? getMatchLineup(matchId, club.id) : Promise.resolve(null)),
    [matchId, club?.id],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [validated, setValidated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Recharge la sélection à chaque changement de feuille (choix d'un match,
  // sauvegarde, validation). Pas de synchronisation manuelle fragile.
  useEffect(() => {
    if (lineupQ.data) {
      setSelected(new Set(lineupQ.data.playerIds));
      setValidated(lineupQ.data.validated);
    }
  }, [lineupQ.data]);

  const roster = rosterQ.data ?? [];

  function toggle(id: string) {
    if (validated) return;
    setErr(null);
    setFlash(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PLAYERS) next.add(id);
      return next;
    });
  }

  async function save() {
    if (!matchId || !club) return;
    setBusy(true);
    setErr(null);
    setFlash(null);
    try {
      await saveMatchLineup(matchId, club.id, [...selected]);
      setFlash(t('Feuille enregistrée.'));
      await lineupQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!matchId || !club) return;
    setBusy(true);
    setErr(null);
    setFlash(null);
    try {
      await saveMatchLineup(matchId, club.id, [...selected]);
      await setLineupValidated(matchId, club.id, true);
      setFlash(t('Feuille validée.'));
      await lineupQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Validation impossible.')));
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    if (!matchId || !club) return;
    setBusy(true);
    try {
      await setLineupValidated(matchId, club.id, false);
      await lineupQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Modification impossible.')));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <Header
      title={t('Feuille de match')}
      left={
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (!session || !club) {
    return (
      <Screen>
        {header}
        <Empty
          icon="lock-closed-outline"
          title={clubs.loading ? t('Chargement…') : t('Aucun club rattaché')}
          subtitle={t('Connecte-toi avec le compte que la fédération a rattaché à ton club.')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}

      <SectionTitle title={t('Match à préparer')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {upcoming.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {matchesQ.loading ? t('Chargement…') : t('Aucun match à venir programmé.')}
            </Text>
          </Card>
        ) : (
          upcoming.map((m) => {
            const on = matchId === m.id;
            const opp = m.home_team_id === club.id ? m.away_team : m.home_team;
            const { day, time } = matchWhen(m.scheduled_at);
            return (
              <Pressable key={m.id} onPress={() => setMatchId(on ? null : m.id)}>
                <Card style={{ borderColor: on ? C.accent : C.border, borderWidth: 1 }}>
                  <Row style={{ gap: 12 }}>
                    <Crest label={teamShort(opp)} color={opp?.color ?? C.surface2} size={30} image={opp?.logo_url} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>
                        {t('contre {team}', { team: opp?.name ?? t('Adversaire') })}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 12 }}>
                        {day} · {time}
                        {m.competition?.name ? ` · ${m.competition.name}` : ''}
                      </Text>
                    </View>
                    <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
                  </Row>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      {matchId ? (
        <>
          <SectionTitle title={t('Mes 12 ({n}/{max})', { n: selected.size, max: MAX_PLAYERS })} />
          <View style={{ paddingHorizontal: S.lg, gap: 8 }}>
            {validated ? (
              <Card style={{ borderColor: C.green, borderWidth: 1 }}>
                <Row style={{ gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                  <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>
                    {t('Feuille validée. Déverrouille pour la modifier.')}
                  </Text>
                </Row>
              </Card>
            ) : null}

            {roster.length === 0 ? (
              <Card>
                <Text style={{ color: C.dim, fontSize: 13 }}>
                  {t('Ajoute d’abord des joueurs à ton effectif.')}
                </Text>
              </Card>
            ) : (
              roster.map((p) => {
                const on = selected.has(p.id);
                return (
                  <Pressable key={p.id} onPress={() => toggle(p.id)} disabled={validated}>
                    <Card style={{ paddingVertical: 10, opacity: validated && !on ? 0.5 : 1 }}>
                      <Row style={{ gap: 12 }}>
                        <Ionicons
                          name={on ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={on ? C.accent : C.dim}
                        />
                        <Crest
                          label={p.full_name.slice(0, 2).toUpperCase()}
                          color={club.color ?? C.surface2}
                          size={30}
                          round
                          image={p.photo_url}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>
                            {p.number != null ? `#${p.number} ` : ''}
                            {p.full_name}
                          </Text>
                          <Text style={{ color: C.dim, fontSize: 12 }}>{p.position ?? t('Poste non précisé')}</Text>
                        </View>
                      </Row>
                    </Card>
                  </Pressable>
                );
              })
            )}

            {err ? <Text style={{ color: C.red, fontSize: 12 }}>{err}</Text> : null}
            {flash ? <Text style={{ color: C.green, fontSize: 12 }}>{flash}</Text> : null}

            <View style={{ gap: 9, marginTop: 4, marginBottom: S.lg }}>
              {validated ? (
                <Button title={t('Déverrouiller')} onPress={unlock} loading={busy} tone="alt" icon="lock-open-outline" />
              ) : (
                <>
                  <Button title={t('Enregistrer')} onPress={save} loading={busy} tone="alt" icon="save-outline" />
                  <Button title={t('Valider ma feuille')} onPress={validate} loading={busy} icon="checkmark-done-outline" />
                </>
              )}
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
