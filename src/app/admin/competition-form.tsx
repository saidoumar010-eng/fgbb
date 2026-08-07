import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field, Row } from '@/components/ui';
import { getCompetition } from '@/lib/db';
import { useT } from '@/lib/i18n';
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
  const { t } = useT();

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
      setError(t('Le nom de la compétition est obligatoire.'));
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
      setFlash(t('Compétition mise à jour.'));
    } else {
      setFlash(t('Compétition « {name} » créée.', { name: name.trim() }));
      setName('');
      setSeason('');
      setFormat('');
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer la compétition'), t('Action irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('competitions').delete().eq('id', id);
          goBack();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier la compétition') : t('Créer une compétition')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Créer la compétition')}>
      <Field label={t('Nom')} placeholder={t('Ex : Ligue 1 Messieurs 2026')} value={name} onChangeText={setName} />

      <FormLabel>{t('Type')}</FormLabel>
      <ChipSelect
        options={TYPES.map((o) => ({ ...o, label: t(o.label) }))}
        value={type}
        onChange={(v) => setType(v as CompetitionType)}
        wrap
      />

      <FormLabel>{t('Catégorie')}</FormLabel>
      <ChipSelect
        options={CATS.map((o) => ({ ...o, label: t(o.label) }))}
        value={category}
        onChange={(v) => setCategory(v as Category)}
        wrap
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Saison')} placeholder="2025-2026" value={season} onChangeText={setSeason} />
        <Field label={t('Format')} placeholder={t('8 équipes')} value={format} onChangeText={setFormat} />
      </Row>

      {editing ? (
        <Button title={t('Supprimer la compétition')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
