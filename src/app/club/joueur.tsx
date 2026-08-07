import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Card, Empty, Field, Header, Row, Screen } from '@/components/ui';
import { getClubRoster, saveClubPlayer } from '@/lib/db-club-space';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, POSITIONS, S } from '@/lib/theme';
import type { Player } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/**
 * Fiche joueur tenue par le club.
 *
 * Volontairement plus courte que le formulaire de la fédération : pas de
 * nationalité ni de club d'appartenance. Changer de club est un transfert, que
 * la fédération instruit — la base refuse d'ailleurs l'opération (migration
 * 0019), l'écran ne fait que ne pas la proposer.
 */
export default function ClubPlayerForm() {
  const { team, id } = useLocalSearchParams<{ team: string; id?: string }>();
  const { t } = useT();

  // On relit l'effectif plutôt que le joueur seul : la policy borne déjà la
  // liste au club, donc un identifiant étranger glissé dans l'URL ne renvoie
  // rien — et l'écran affiche « joueur introuvable » au lieu de fuiter.
  const roster = useFetch(() => (team ? getClubRoster(team) : Promise.resolve([] as Player[])), [team]);
  const existing = id ? roster.data?.find((p) => p.id === id) : undefined;
  const loaded = !roster.loading;

  const [name, setName] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [height, setHeight] = useState<string | null>(null);
  const [birth, setBirth] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const vName = name ?? existing?.full_name ?? '';
  const vNumber = number ?? (existing?.number != null ? String(existing.number) : '');
  const vPosition = position ?? existing?.position ?? '';
  const vHeight = height ?? (existing?.height_cm != null ? String(existing.height_cm) : '');
  const vBirth = birth ?? existing?.birth_date ?? '';
  const vPhoto = photo ?? existing?.photo_url ?? null;

  async function save() {
    if (!team) return;
    if (!vName.trim()) {
      setErr(t('Le nom du joueur est obligatoire.'));
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await saveClubPlayer(team, {
        id,
        full_name: vName,
        number: vNumber.trim() ? Number(vNumber) : null,
        position: vPosition || null,
        height_cm: vHeight.trim() ? Number(vHeight) : null,
        birth_date: vBirth.trim() || null,
        photo_url: vPhoto,
      });
      goBack();
    } catch (e) {
      setErr(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <Header
      title={id ? t('Modifier le joueur') : t('Nouveau joueur')}
      left={
        <Pressable onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (id && loaded && !existing) {
    return (
      <Screen>
        {header}
        <Empty icon="person-outline" title={t('Joueur introuvable')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <View style={{ padding: S.lg }}>
        <Card>
          <ImageField label={t('Photo du joueur')} value={vPhoto} onChange={setPhoto} folder="players" />
          <Field
            label={t('Nom complet')}
            value={vName}
            onChangeText={setName}
            placeholder={t('Prénom et nom')}
          />
          <Row style={{ gap: 11 }}>
            <Field
              label={t('Numéro')}
              value={vNumber}
              onChangeText={setNumber}
              keyboardType="number-pad"
              placeholder="7"
            />
            <Field
              label={t('Taille (cm)')}
              value={vHeight}
              onChangeText={setHeight}
              keyboardType="number-pad"
              placeholder="190"
            />
          </Row>
          <Field
            label={t('Date de naissance')}
            value={vBirth}
            onChangeText={setBirth}
            placeholder="1998-05-21"
          />

          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>{t('Poste')}</Text>
          {/* Les postes restent en français dans la constante de module ; `t()`
              s'applique à l'affichage seul, sinon les règles des hooks sautent. */}
          <ChipSelect
            options={POSITIONS.map((p) => ({ id: p, label: t(p) }))}
            value={vPosition}
            onChange={setPosition}
            wrap
          />

          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 12 }}>{err}</Text> : null}
          <Button title={t('Enregistrer')} onPress={save} loading={saving} icon="save-outline" />
        </Card>
      </View>
    </Screen>
  );
}
