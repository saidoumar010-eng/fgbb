import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field, Row } from '@/components/ui';
import { getCompetition } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Category, CompetitionType } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const TYPES = [
  { id: 'championnat', label: 'Championnat' },
  { id: 'coupe', label: 'Coupe' },
  { id: 'tournoi', label: 'Tournoi' },
];
const CATS = [
  { id: 'messieurs', label: 'Messieurs' },
  { id: 'dames', label: 'Dames' },
  { id: 'u18', label: 'U18' },
];

export default function CompetitionForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getCompetition(id) : null), [id]);

  const [name, setName] = useState('');
  const [type, setType] = useState<CompetitionType>('championnat');
  const [category, setCategory] = useState<Category>('messieurs');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const c = existing.data;
    if (c && !seeded.current) {
      setName(c.name);
      setType(c.type);
      setCategory(c.category);
      setSeason(c.season ?? '');
      setFormat(c.format ?? '');
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!name.trim()) {
      setError('Le nom de la compétition est obligatoire.');
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const payload = {
      name: name.trim(),
      type,
      category,
      season: season.trim() || null,
      format: format.trim() || null,
    };
    const { error: err } = editing
      ? await supabase.from('competitions').update(payload).eq('id', id)
      : await supabase.from('competitions').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (editing) {
      setFlash('Compétition mise à jour.');
    } else {
      setFlash(`Compétition « ${name.trim()} » créée.`);
      setName('');
      setSeason('');
      setFormat('');
    }
  }

  function confirmDelete() {
    Alert.alert('Supprimer la compétition', 'Action irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('competitions').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? 'Modifier la compétition' : 'Créer une compétition'}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? 'Enregistrer les modifications' : 'Créer la compétition'}>
      <Field label="Nom" placeholder="Ex : Ligue 1 Messieurs 2026" value={name} onChangeText={setName} />

      <FormLabel>Type</FormLabel>
      <ChipSelect options={TYPES} value={type} onChange={(v) => setType(v as CompetitionType)} wrap />

      <FormLabel>Catégorie</FormLabel>
      <ChipSelect options={CATS} value={category} onChange={(v) => setCategory(v as Category)} wrap />

      <Row style={{ gap: 10 }}>
        <Field label="Saison" placeholder="2025-2026" value={season} onChangeText={setSeason} />
        <Field label="Format" placeholder="8 équipes" value={format} onChangeText={setFormat} />
      </Row>

      {editing ? (
        <Button title="Supprimer la compétition" tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
