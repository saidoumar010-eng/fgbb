import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import { getPlayer, listTeams } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { POSITIONS } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function PlayerForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const teams = useFetch(() => listTeams());
  const existing = useFetch(async () => (id ? getPlayer(id) : null), [id]);

  const [fullName, setFullName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState<string | undefined>();
  const [height, setHeight] = useState('');
  const [birth, setBirth] = useState('');
  const [nationality, setNationality] = useState('Guinéenne');
  const [teamId, setTeamId] = useState<string | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const p = existing.data;
    if (p && !seeded.current) {
      setFullName(p.full_name);
      setNumber(p.number ? String(p.number) : '');
      setPosition(p.position ?? undefined);
      setHeight(p.height_cm ? String(p.height_cm) : '');
      setBirth(p.birth_date ?? '');
      setNationality(p.nationality ?? '');
      setTeamId(p.team_id ?? undefined);
      setPhotoUrl(p.photo_url ?? null);
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!fullName.trim()) {
      setError(t('Le nom du joueur est obligatoire.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const payload = {
      full_name: fullName.trim(),
      team_id: teamId ?? null,
      number: number ? parseInt(number, 10) : null,
      position: position ?? null,
      height_cm: height ? parseInt(height, 10) : null,
      birth_date: birth.trim() || null,
      nationality: nationality.trim() || null,
      photo_url: photoUrl,
    };
    const { error: err } = editing
      ? await supabase.from('players').update(payload).eq('id', id)
      : await supabase.from('players').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (editing) {
      setFlash(t('Joueur mis à jour.'));
    } else {
      setFlash(t("{name} a été ajouté à l'effectif.", { name: fullName.trim() }));
      setFullName('');
      setNumber('');
      setPosition(undefined);
      setHeight('');
      setBirth('');
      setPhotoUrl(null);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer le joueur'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('players').delete().eq('id', id);
          goBack();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier le joueur') : t('Ajouter un joueur')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer le joueur')}>
      <ImageField label={t('Photo du joueur')} value={photoUrl} onChange={setPhotoUrl} folder="players" shape="circle" />
      <Field label={t('Nom complet')} placeholder={t('Prénom et nom')} value={fullName} onChangeText={setFullName} />

      <FormLabel>{t('Club')}</FormLabel>
      <ChipSelect
        options={(teams.data ?? []).map((team) => ({ id: team.id, label: team.name, color: team.color }))}
        value={teamId}
        onChange={setTeamId}
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Numéro')} placeholder="7" keyboardType="number-pad" value={number} onChangeText={setNumber} />
        <Field label={t('Taille (cm)')} placeholder="189" keyboardType="number-pad" value={height} onChangeText={setHeight} />
      </Row>

      <FormLabel>{t('Poste')}</FormLabel>
      <ChipSelect options={POSITIONS.map((p) => ({ id: p, label: t(p) }))} value={position} onChange={setPosition} wrap />

      <Row style={{ gap: 10 }}>
        <Field label={t('Naissance')} placeholder={t('AAAA-MM-JJ')} value={birth} onChangeText={setBirth} />
        <Field label={t('Nationalité')} placeholder={t('Guinéenne')} value={nationality} onChangeText={setNationality} />
      </Row>

      {editing ? (
        <Button title={t('Supprimer le joueur')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
