import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { listCompetitions, listTeams } from '@/lib/db';
import { createMatches, getCurrentSeason, type NewMatchRow } from '@/lib/db-officials';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Team } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

interface Pairing {
  home: string;
  away: string;
}

// Équipe fictive ajoutée quand le nombre d'équipes est impair : son adversaire
// du jour est exempt (il ne joue pas cette journée-là).
const BYE = '__exempt__';

/**
 * Tournoi toutes rondes par la méthode du cercle.
 *
 * On dispose les équipes sur deux rangées ; la première reste fixe et les
 * autres tournent d'un cran à chaque journée. À chaque tour on apparie le
 * début et la fin du tableau (i avec n-1-i), ce qui garantit :
 *   - qu'une équipe n'apparaît qu'une seule fois par journée ;
 *   - qu'après n-1 journées chaque paire s'est rencontrée exactement une fois.
 *
 * Avec un effectif impair, on ajoute une équipe fictive : la journée compte
 * alors un match de moins et l'équipe qui lui est appariée est exempte.
 */
function roundRobin(teamIds: string[]): Pairing[][] {
  const list = teamIds.slice();
  if (list.length % 2 === 1) list.push(BYE);
  const n = list.length;
  const half = n / 2;
  const rounds: Pairing[][] = [];
  const circle = list.slice(1); // les équipes mobiles

  for (let r = 0; r < n - 1; r++) {
    const row = [list[0], ...circle];
    const pairs: Pairing[] = [];
    for (let i = 0; i < half; i++) {
      const a = row[i];
      const b = row[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Sans alternance, l'équipe fixe recevrait à chaque journée : on inverse
      // domicile et extérieur une journée sur deux.
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(pairs);
    circle.unshift(circle.pop() as string); // rotation d'un cran
  }
  return rounds;
}

const WEEKDAYS = [
  { id: '1', label: 'Lundi' },
  { id: '2', label: 'Mardi' },
  { id: '3', label: 'Mercredi' },
  { id: '4', label: 'Jeudi' },
  { id: '5', label: 'Vendredi' },
  { id: '6', label: 'Samedi' },
  { id: '0', label: 'Dimanche' },
];

const DAY_MS = 86400000;

/** Date d'une journée : on part de la date de début, on avance jusqu'au jour
 * de la semaine choisi, puis on ajoute l'intervalle pour chaque journée.
 * Tout est calculé en UTC — la Guinée est à GMT, comme le reste de l'app. */
function roundDate(start: string, weekday: number, intervalDays: number, roundIndex: number, time: string) {
  const [y, m, d] = start.split('-').map((v) => parseInt(v, 10));
  const [hh, mm] = time.split(':').map((v) => parseInt(v, 10));
  const base = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const shift = (weekday - new Date(base).getUTCDay() + 7) % 7;
  return new Date(base + (shift + roundIndex * intervalDays) * DAY_MS).toISOString();
}

export default function CalendarGen() {
  const { t } = useT();
  const comps = useFetch(() => listCompetitions());
  const teamsQuery = useFetch(() => listTeams());
  const season = useFetch(() => getCurrentSeason());

  const [competitionId, setCompetitionId] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [twoLegs, setTwoLegs] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekday, setWeekday] = useState('6');
  const [intervalText, setIntervalText] = useState('7');
  const [time, setTime] = useState('16:00');
  const [venue, setVenue] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const teams = teamsQuery.data ?? [];
  const byId = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((tm) => {
      map[tm.id] = tm;
    });
    return map;
  }, [teams]);

  function toggleTeam(teamId: string) {
    setReport(null);
    setSelected((prev) => (prev.includes(teamId) ? prev.filter((x) => x !== teamId) : [...prev, teamId]));
  }

  // Aperçu recalculé à chaque changement : aucune écriture tant que l'admin
  // n'a pas confirmé.
  const rounds = useMemo(() => {
    if (selected.length < 2) return [];
    const first = roundRobin(selected);
    if (!twoLegs) return first;
    // Match retour : mêmes affiches, domicile et extérieur inversés.
    return [...first, ...first.map((pairs) => pairs.map((p) => ({ home: p.away, away: p.home })))];
  }, [selected, twoLegs]);

  const total = rounds.reduce((sum, pairs) => sum + pairs.length, 0);
  const intervalDays = parseInt(intervalText || '0', 10);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim());
  const timeOk = /^\d{1,2}:\d{2}$/.test(time.trim());

  function validate() {
    if (selected.length < 2) return t('Sélectionne au moins deux équipes.');
    if (!competitionId) return t('Choisis la compétition.');
    if (!dateOk) return t('La date de début doit être au format AAAA-MM-JJ.');
    if (!timeOk) return t("L'heure doit être au format HH:MM.");
    if (!intervalDays || intervalDays < 1) return t("L'intervalle doit être d'au moins un jour.");
    return null;
  }

  function askCreate() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    Alert.alert(
      t('Créer le calendrier'),
      t('{n} matchs vont être créés sur {j} journées. Continuer ?', { n: total, j: rounds.length }),
      [
        { text: t('Annuler'), style: 'cancel' },
        { text: t('Créer'), onPress: create },
      ],
    );
  }

  async function create() {
    setCreating(true);
    setError(null);
    setReport(null);
    try {
      const rows: NewMatchRow[] = [];
      rounds.forEach((pairs, index) => {
        const at = roundDate(startDate.trim(), parseInt(weekday, 10), intervalDays, index, time.trim());
        pairs.forEach((p) => {
          rows.push({
            competition_id: competitionId ?? null,
            season_id: season.data?.id ?? null,
            home_team_id: p.home,
            away_team_id: p.away,
            round: index + 1,
            scheduled_at: at,
            venue: venue.trim() || null,
          });
        });
      });
      const created = await createMatches(rows);
      setReport(
        t('{n} matchs créés sur {j} journées, du {d1} au {d2}.', {
          n: created,
          j: rounds.length,
          d1: fullDate(rows[0]?.scheduled_at),
          d2: fullDate(rows[rows.length - 1]?.scheduled_at),
        }),
      );
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen>
      <Header
        title={t('Générateur de calendrier')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        {report ? (
          <Card style={{ borderColor: 'rgba(43,196,138,0.4)', marginBottom: S.md }}>
            <Text style={{ color: C.green, fontSize: 13 }}>{report}</Text>
            <Pressable onPress={() => router.push('/admin/matches' as never)}>
              <Text style={{ color: C.accent, fontSize: 13, marginTop: 8 }}>{t('Voir les matchs créés')}</Text>
            </Pressable>
          </Card>
        ) : null}

        <FormLabel>{t('Compétition')}</FormLabel>
        <ChipSelect
          options={(comps.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          value={competitionId}
          onChange={(v) => {
            setCompetitionId(v);
            setReport(null);
          }}
        />
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
          {season.data
            ? t('Saison en cours : {name}', { name: season.data.name })
            : t('Aucune saison en cours : les matchs seront créés sans saison.')}
        </Text>

        <FormLabel>{t('Formule')}</FormLabel>
        <ChipSelect
          options={[
            { id: 'simple', label: t('Aller simple') },
            { id: 'retour', label: t('Aller-retour') },
          ]}
          value={twoLegs ? 'retour' : 'simple'}
          onChange={(v) => {
            setTwoLegs(v === 'retour');
            setReport(null);
          }}
          wrap
        />

        <Row style={{ gap: 10 }}>
          <Field label={t('Date de début')} placeholder="AAAA-MM-JJ" value={startDate} onChangeText={setStartDate} />
          <Field label={t('Heure')} placeholder="16:00" value={time} onChangeText={setTime} />
        </Row>

        <FormLabel>{t('Jour des rencontres')}</FormLabel>
        <ChipSelect
          options={WEEKDAYS.map((d) => ({ id: d.id, label: t(d.label) }))}
          value={weekday}
          onChange={setWeekday}
          wrap
        />

        <Row style={{ gap: 10 }}>
          <Field
            label={t('Jours entre deux journées')}
            placeholder="7"
            keyboardType="number-pad"
            value={intervalText}
            onChangeText={setIntervalText}
          />
          <Field label={t('Lieu par défaut')} placeholder="Palais des Sports" value={venue} onChangeText={setVenue} />
        </Row>
      </View>

      <SectionTitle
        title={t('Équipes participantes')}
        action={
          <Pressable
            onPress={() => {
              setReport(null);
              setSelected(selected.length === teams.length ? [] : teams.map((tm) => tm.id));
            }}>
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>
              {selected.length === teams.length && teams.length > 0 ? t('Tout désélectionner') : t('Tout sélectionner')}
            </Text>
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
          {teams.length === 0 ? (
            <Text style={{ color: C.dim, fontSize: 13, paddingVertical: 12 }}>
              {teamsQuery.loading ? t('Chargement…') : t('Aucune équipe enregistrée')}
            </Text>
          ) : (
            teams.map((tm, i) => {
              const on = selected.includes(tm.id);
              return (
                <Pressable key={tm.id} onPress={() => toggleTeam(tm.id)}>
                  <Row
                    style={{
                      paddingVertical: 11,
                      gap: 12,
                      borderBottomWidth: i < teams.length - 1 ? 1 : 0,
                      borderBottomColor: C.border,
                    }}>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={on ? C.accent : C.dim}
                    />
                    <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                      {tm.name}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{tm.division ?? ''}</Text>
                  </Row>
                </Pressable>
              );
            })
          )}
        </Card>
      </View>

      <SectionTitle title={t('Aperçu du calendrier')} />
      <View style={{ paddingHorizontal: S.lg }}>
        {selected.length < 2 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {t('Sélectionne au moins deux équipes pour voir le calendrier.')}
            </Text>
          </Card>
        ) : (
          <>
            <Card style={{ marginBottom: S.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>{t('Équipes')}</Text>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{selected.length}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>{t('Journées')}</Text>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{rounds.length}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>{t('Total des matchs')}</Text>
                <Text style={{ color: C.accent, fontSize: 15, fontWeight: '700' }}>{total}</Text>
              </Row>
              {selected.length % 2 === 1 ? (
                <Text style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
                  {t('Effectif impair : une équipe est exempte à chaque journée.')}
                </Text>
              ) : null}
            </Card>

            {rounds.map((pairs, index) => (
              <Card key={index} style={{ marginBottom: 9 }}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                    {t('Journée {n}', { n: index + 1 })}
                  </Text>
                  {dateOk && timeOk && intervalDays > 0 ? (
                    <Text style={{ color: C.accent, fontSize: 12 }}>
                      {fullDate(roundDate(startDate.trim(), parseInt(weekday, 10), intervalDays, index, time.trim()))}
                    </Text>
                  ) : null}
                </Row>
                {pairs.map((p) => (
                  <Row key={`${p.home}-${p.away}`} style={{ paddingVertical: 4 }}>
                    <Text style={{ color: C.text, fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                      {byId[p.home]?.name ?? teamShort(byId[p.home])}
                    </Text>
                    <View
                      style={{
                        backgroundColor: C.surface2,
                        borderRadius: R.sm,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        marginHorizontal: 8,
                      }}>
                      <Text style={{ color: C.muted, fontSize: 11 }}>{t('reçoit')}</Text>
                    </View>
                    <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {byId[p.away]?.name ?? teamShort(byId[p.away])}
                    </Text>
                  </Row>
                ))}
              </Card>
            ))}
          </>
        )}

        {error ? <Text style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}

        <Button
          title={t('Créer les {n} matchs', { n: total })}
          icon="calendar-outline"
          onPress={askCreate}
          loading={creating}
          disabled={total === 0}
        />
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 10 }}>
          {t('Les matchs sont créés au statut « à venir ». Tu peux ensuite ajuster chaque affiche.')}
        </Text>
      </View>
    </Screen>
  );
}
