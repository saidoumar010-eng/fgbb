import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Card, Crest, Empty, Row } from '@/components/ui';
import { getMatch } from '@/lib/db';
import {
  listMatchOfficials,
  listReferees,
  OFFICIAL_ROLES,
  officialRoleLabel,
  refereeLevelLabel,
  setMatchOfficials,
} from '@/lib/db-officials';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { OfficialRole } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function MatchOfficialsForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useFetch(() => getMatch(id), [id]);
  const referees = useFetch(() => listReferees(true));
  const current = useFetch(() => listMatchOfficials(id), [id]);

  const [role, setRole] = useState<OfficialRole>('principal');
  const [assigned, setAssigned] = useState<Record<string, OfficialRole>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const rows = current.data;
    if (rows && !seeded.current) {
      const map: Record<string, OfficialRole> = {};
      rows.forEach((o) => {
        map[o.referee_id] = o.role;
      });
      setAssigned(map);
      seeded.current = true;
    }
  }, [current.data]);

  // Un appui attribue le rôle sélectionné ; un second appui sur le même rôle
  // retire l'arbitre de la feuille de match.
  function toggle(refereeId: string) {
    setAssigned((prev) => {
      const next = { ...prev };
      if (next[refereeId] === role) delete next[refereeId];
      else next[refereeId] = role;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await setMatchOfficials(
        id,
        Object.entries(assigned).map(([referee_id, r]) => ({ referee_id, role: r })),
      );
      setFlash(t('Désignation enregistrée.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  const m = match.data;
  const list = referees.data ?? [];
  const count = Object.keys(assigned).length;

  return (
    <AdminForm
      title={t('Désignation des arbitres')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={t('Enregistrer la désignation')}>
      <Card style={{ marginBottom: 4 }}>
        {m ? (
          <>
            <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
              {m.competition?.name ?? t('Match')}
              {m.venue ? ` · ${m.venue}` : ''}
            </Text>
            <Row style={{ justifyContent: 'space-around' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Crest label={teamShort(m.home_team)} color={m.home_team?.color ?? C.surface2} size={40} />
                <Text style={{ color: C.text, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                  {m.home_team?.name}
                </Text>
              </View>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '600', paddingHorizontal: 6 }}>vs</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Crest label={teamShort(m.away_team)} color={m.away_team?.color ?? C.surface2} size={40} />
                <Text style={{ color: C.text, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                  {m.away_team?.name}
                </Text>
              </View>
            </Row>
            {m.scheduled_at ? (
              <Text style={{ color: C.accent, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
                {fullDate(m.scheduled_at)}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={{ color: C.dim, fontSize: 13, textAlign: 'center' }}>
            {match.loading ? t('Chargement…') : t('Match introuvable')}
          </Text>
        )}
      </Card>

      <FormLabel>{t('Rôle à attribuer')}</FormLabel>
      <ChipSelect
        options={OFFICIAL_ROLES.map((o) => ({ id: o.id, label: t(o.label) }))}
        value={role}
        onChange={(v) => setRole(v as OfficialRole)}
        wrap
      />

      <FormLabel>{t('Arbitres actifs')}</FormLabel>
      {list.length === 0 ? (
        <Empty
          icon="person-outline"
          title={referees.loading ? t('Chargement…') : t('Aucun arbitre actif')}
          subtitle={referees.loading ? undefined : t('Ajoute des arbitres depuis la fiche Arbitres.')}
        />
      ) : (
        <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
          {list.map((r, i) => {
            const mine = assigned[r.id];
            return (
              <Pressable key={r.id} onPress={() => toggle(r.id)}>
                <Row
                  style={{
                    paddingVertical: 11,
                    gap: 12,
                    borderBottomWidth: i < list.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                  }}>
                  <Ionicons
                    name={mine ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={mine ? C.accent : C.dim}
                  />
                  <Crest
                    label={r.full_name.slice(0, 2).toUpperCase()}
                    color={C.surface2}
                    size={30}
                    round
                    image={r.photo_url}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{r.full_name}</Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>
                      {t(refereeLevelLabel(r.level))}
                      {r.city ? ` · ${r.city}` : ''}
                    </Text>
                  </View>
                  {mine ? (
                    <View
                      style={{
                        backgroundColor: C.accentSoft,
                        borderRadius: R.pill,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                      }}>
                      <Text style={{ color: C.accent, fontSize: 11, fontWeight: '600' }}>
                        {t(officialRoleLabel(mine))}
                      </Text>
                    </View>
                  ) : null}
                </Row>
              </Pressable>
            );
          })}
        </Card>
      )}

      <Text style={{ color: C.dim, fontSize: 12, marginTop: S.md }}>
        {count === 0 ? t('Aucun officiel désigné') : t('{n} officiels désignés', { n: count })}
      </Text>

      <Pressable onPress={() => router.push(`/match/${id}` as never)} style={{ marginTop: S.md }}>
        <Text style={{ color: C.accent, fontSize: 13 }}>{t('Voir la fiche publique du match')}</Text>
      </Pressable>
    </AdminForm>
  );
}
