import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import { getPlayer, listTeams } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { POSITIONS } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function PlayerForm() {
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
      setError('Le nom du joueur est obligatoire.');
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
      setFlash('Joueur mis à jour.');
    } else {
      setFlash(`${fullName.trim()} a été ajouté à l'effectif.`);
      setFullName('');
      setNumber('');
      setPosition(undefined);
      setHeight('');
      setBirth('');
      setPhotoUrl(null);
    }
  }

  function confirmDelete() {
    Alert.alert('Supprimer le joueur', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('players').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? 'Modifier le joueur' : 'Ajouter un joueur'}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? 'Enregistrer les modifications' : 'Enregistrer le joueur'}>
      <ImageField label="Photo du joueur" value={photoUrl} onChange={setPhotoUrl} folder="players" shape="circle" />
      <Field label="Nom complet" placeholder="Prénom et nom" value={fullName} onChangeText={setFullName} />

      <FormLabel>Club</FormLabel>
      <ChipSelect
        options={(teams.data ?? []).map((t) => ({ id: t.id, label: t.name, color: t.color }))}
        value={teamId}
        onChange={setTeamId}
      />

      <Row style={{ gap: 10 }}>
        <Field label="Numéro" placeholder="7" keyboardType="number-pad" value={number} onChangeText={setNumber} />
        <Field label="Taille (cm)" placeholder="189" keyboardType="number-pad" value={height} onChangeText={setHeight} />
      </Row>

      <FormLabel>Poste</FormLabel>
      <ChipSelect options={POSITIONS.map((p) => ({ id: p, label: p }))} value={position} onChange={setPosition} wrap />

      <Row style={{ gap: 10 }}>
        <Field label="Naissance" placeholder="AAAA-MM-JJ" value={birth} onChangeText={setBirth} />
        <Field label="Nationalité" placeholder="Guinéenne" value={nationality} onChangeText={setNationality} />
      </Row>

      {editing ? (
        <Button title="Supprimer le joueur" tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
