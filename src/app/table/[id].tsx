import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Crest, Empty, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getMatch } from '@/lib/db';
import { errorMessage } from '@/lib/db-fan';
import {
  getMatchLineups,
  setMatchStream,
  setSheetValidated,
  type MatchLineupSide,
} from '@/lib/db-matchday';
import { listMatchOfficials, listReferees, OFFICIAL_ROLES, setMatchOfficials } from '@/lib/db-officials';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { OfficialRole, Team } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

interface Designation {
  referee_id: string;
  role: OfficialRole;
}

// Écran d'un match pour la table technique : désigner les arbitres et consulter
// les feuilles validées par chaque équipe.
export default function TableMatchScreen() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();

  const matchQ = useFetch(() => getMatch(id), [id]);
  const lineupsQ = useFetch(() => getMatchLineups(id), [id]);
  const officialsQ = useFetch(() => listMatchOfficials(id), [id]);
  const refereesQ = useFetch(() => listReferees(true), []);

  const [designations, setDesignations] = useState<Designation[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Seed depuis la désignation enregistrée quand elle arrive.
  useEffect(() => {
    if (officialsQ.data) {
      setDesignations(officialsQ.data.map((o) => ({ referee_id: o.referee_id, role: o.role })));
    }
  }, [officialsQ.data]);

  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [stream, setStream] = useState('');
  const [streamBusy, setStreamBusy] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);
  useEffect(() => {
    if (matchQ.data) setStream(matchQ.data.stream_url ?? '');
  }, [matchQ.data]);
  const validated = !!matchQ.data?.officials_validated_at;

  async function saveStream() {
    setStreamBusy(true);
    setErr(null);
    setFlash(null);
    try {
      await setMatchStream(id, stream.trim() || null);
      setFlash(t('Lien de diffusion enregistré.'));
      await matchQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setStreamBusy(false);
    }
  }

  async function toggleSheet() {
    setSheetBusy(true);
    setErr(null);
    setFlash(null);
    try {
      await setSheetValidated(id, uid, !validated);
      await matchQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Validation impossible.')));
    } finally {
      setSheetBusy(false);
    }
  }

  const m = matchQ.data;
  const referees = refereesQ.data ?? [];
  const refName = useMemo(() => new Map(referees.map((r) => [r.id, r.full_name])), [referees]);
  const assigned = new Set(designations.map((d) => d.referee_id));
  const available = referees.filter((r) => !assigned.has(r.id));

  function addReferee(refereeId: string) {
    setFlash(null);
    setDesignations((prev) => [...prev, { referee_id: refereeId, role: 'principal' }]);
  }
  function setRole(refereeId: string, role: OfficialRole) {
    setDesignations((prev) => prev.map((d) => (d.referee_id === refereeId ? { ...d, role } : d)));
  }
  function remove(refereeId: string) {
    setDesignations((prev) => prev.filter((d) => d.referee_id !== refereeId));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setFlash(null);
    try {
      await setMatchOfficials(id, designations);
      setFlash(t('Désignation enregistrée.'));
      await officialsQ.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <Header
      title={t('Table technique')}
      left={
        <Pressable onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (!m) {
    return (
      <Screen>
        {header}
        <Empty icon="basketball-outline" title={matchQ.loading ? t('Chargement…') : t('Match introuvable')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}

      <View style={{ padding: S.lg }}>
        <Card>
          <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
            {m.competition?.name ?? t('Match')} {m.venue ? `· ${m.venue}` : ''}
          </Text>
          <Row style={{ justifyContent: 'space-around', alignItems: 'center' }}>
            <TeamMini team={m.home_team} />
            <Text style={{ color: C.dim, fontSize: 16, fontWeight: '600' }}>{t('contre')}</Text>
            <TeamMini team={m.away_team} />
          </Row>
          {m.scheduled_at ? (
            <Text style={{ color: C.accent, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              {fullDate(m.scheduled_at)}
            </Text>
          ) : null}
        </Card>
      </View>

      {/* Diffusion en direct & validation de la feuille */}
      <SectionTitle title={t('Diffusion & feuille')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        <Card>
          <Field
            label={t('Lien de diffusion en direct')}
            value={stream}
            onChangeText={setStream}
            placeholder="https://…"
            autoCapitalize="none"
          />
          <Button title={t('Enregistrer le lien')} onPress={saveStream} loading={streamBusy} tone="alt" icon="videocam-outline" />
        </Card>
        <Card style={{ borderColor: validated ? C.green : C.border, borderWidth: 1 }}>
          <Row style={{ gap: 10, marginBottom: 4 }}>
            <Ionicons
              name={validated ? 'checkmark-circle' : 'document-text-outline'}
              size={18}
              color={validated ? C.green : C.muted}
            />
            <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>
              {validated ? t('Feuille validée par les arbitres.') : t('Feuille de match non encore validée.')}
            </Text>
          </Row>
          <Button
            title={validated ? t('Annuler la validation') : t('Valider la feuille (arbitres)')}
            onPress={toggleSheet}
            loading={sheetBusy}
            tone={validated ? 'alt' : 'accent'}
            icon="checkmark-done-outline"
          />
        </Card>
      </View>

      {/* Désignation des arbitres */}
      <SectionTitle title={t('Arbitres désignés')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {designations.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>{t('Aucun arbitre désigné pour l’instant.')}</Text>
          </Card>
        ) : (
          designations.map((d) => (
            <Card key={d.referee_id}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                  {refName.get(d.referee_id) ?? t('Arbitre')}
                </Text>
                <Pressable onPress={() => remove(d.referee_id)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={C.red} />
                </Pressable>
              </Row>
              <ChipSelect
                options={OFFICIAL_ROLES.map((r) => ({ id: r.id, label: t(r.label) }))}
                value={d.role}
                onChange={(v) => setRole(d.referee_id, v as OfficialRole)}
              />
            </Card>
          ))
        )}

        {available.length > 0 ? (
          <Card>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              {t('Ajouter un arbitre')}
            </Text>
            {available.map((r, i) => (
              <Pressable key={r.id} onPress={() => addReferee(r.id)}>
                <Row
                  style={{
                    paddingVertical: 9,
                    gap: 10,
                    borderBottomWidth: i < available.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                  }}>
                  <Ionicons name="add-circle-outline" size={18} color={C.accent} />
                  <Text style={{ color: C.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                    {r.full_name}
                  </Text>
                  {r.city ? <Text style={{ color: C.dim, fontSize: 11.5 }}>{r.city}</Text> : null}
                </Row>
              </Pressable>
            ))}
          </Card>
        ) : referees.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 12.5 }}>
              {t('Aucun arbitre actif. La fédération doit d’abord en enregistrer.')}
            </Text>
          </Card>
        ) : null}

        {err ? <Text style={{ color: C.red, fontSize: 12 }}>{err}</Text> : null}
        {flash ? <Text style={{ color: C.green, fontSize: 12 }}>{flash}</Text> : null}
        <Button title={t('Enregistrer la désignation')} onPress={save} loading={saving} icon="save-outline" />
      </View>

      {/* Feuilles de match des deux équipes */}
      <SectionTitle title={t('Feuilles des équipes')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9, paddingBottom: S.lg }}>
        <LineupSide side={findSide(lineupsQ.data, m.home_team_id)} team={m.home_team} />
        <LineupSide side={findSide(lineupsQ.data, m.away_team_id)} team={m.away_team} />
      </View>
    </Screen>
  );
}

function findSide(sides: MatchLineupSide[] | null | undefined, teamId: string) {
  return (sides ?? []).find((s) => s.team_id === teamId) ?? null;
}

function TeamMini({ team }: { team?: Team }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Crest label={teamShort(team)} color={team?.color ?? C.surface2} size={40} image={team?.logo_url} />
      <Text style={{ color: C.text, fontSize: 12, marginTop: 6, textAlign: 'center' }} numberOfLines={2}>
        {team?.name}
      </Text>
    </View>
  );
}

function LineupSide({ side, team }: { side: MatchLineupSide | null; team?: Team }) {
  const { t } = useT();
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: side?.players.length ? 8 : 0 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {team?.name ?? t('Équipe')}
        </Text>
        {side?.validated ? (
          <Row style={{ gap: 5 }}>
            <Ionicons name="checkmark-circle" size={15} color={C.green} />
            <Text style={{ color: C.green, fontSize: 11.5, fontWeight: '600' }}>{t('Validée')}</Text>
          </Row>
        ) : (
          <Text style={{ color: C.dim, fontSize: 11.5 }}>{t('En attente')}</Text>
        )}
      </Row>
      {side && side.players.length > 0 ? (
        side.players.map((p) => (
          <Text key={p.id} style={{ color: C.muted, fontSize: 12.5, paddingVertical: 2 }} numberOfLines={1}>
            {p.number != null ? `#${p.number} ` : ''}
            {p.full_name}
          </Text>
        ))
      ) : (
        <Text style={{ color: C.dim, fontSize: 12.5 }}>{t('Feuille non encore renseignée.')}</Text>
      )}
    </Card>
  );
}
