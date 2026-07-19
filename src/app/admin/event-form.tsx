import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import {
  deleteEvent,
  EVENT_CATEGORIES,
  fromIso,
  getEvent,
  toIso,
  upsertEvent,
} from '@/lib/db-content';
import { useT } from '@/lib/i18n';
import type { EventCategory } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function EventForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getEvent(id) : null), [id]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('federation');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const e = existing.data;
    if (e && !seeded.current) {
      const start = fromIso(e.starts_at);
      const end = fromIso(e.ends_at);
      setTitle(e.title);
      setDescription(e.description ?? '');
      setCategory(e.category);
      setStartDate(start.date);
      setStartTime(start.time);
      setEndDate(end.date);
      setEndTime(end.time);
      setLocation(e.location ?? '');
      setCoverUrl(e.cover_url ?? null);
      seeded.current = true;
    }
  }, [existing.data]);

  function reset() {
    setTitle('');
    setDescription('');
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
    setLocation('');
    setCoverUrl(null);
  }

  async function save() {
    if (!title.trim()) {
      setError(t('Le titre de l’événement est obligatoire.'));
      return;
    }
    const starts = toIso(startDate, startTime);
    if (!starts) {
      setError(t('Indique une date de début au format AAAA-MM-JJ.'));
      return;
    }
    const ends = endDate.trim() ? toIso(endDate, endTime) : null;
    if (endDate.trim() && !ends) {
      setError(t('La date de fin doit être au format AAAA-MM-JJ.'));
      return;
    }
    if (ends && ends < starts) {
      setError(t('La date de fin précède la date de début.'));
      return;
    }

    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertEvent({
        id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        starts_at: starts,
        ends_at: ends,
        location: location.trim() || null,
        cover_url: coverUrl,
      });
      if (editing) {
        setFlash(t('Événement mis à jour.'));
      } else {
        setFlash(t('L’événement {title} a été ajouté à l’agenda.', { title: title.trim() }));
        reset();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer l’événement'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteEvent(id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Erreur de chargement'));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier l’événement') : t('Nouvel événement')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer l’événement')}>
      <ImageField label={t('Visuel')} value={coverUrl} onChange={setCoverUrl} folder="events" shape="wide" />

      <Field
        label={t('Titre')}
        placeholder={t('Assemblée générale ordinaire')}
        value={title}
        onChangeText={setTitle}
      />

      <FormLabel>{t('Catégorie')}</FormLabel>
      <ChipSelect
        options={EVENT_CATEGORIES.map((c) => ({ id: c.id, label: t(c.label) }))}
        value={category}
        onChange={(v) => setCategory(v as EventCategory)}
        wrap
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Début')} placeholder={t('AAAA-MM-JJ')} value={startDate} onChangeText={setStartDate} />
        <Field label={t('Heure')} placeholder="18:00" value={startTime} onChangeText={setStartTime} />
      </Row>

      <Row style={{ gap: 10 }}>
        <Field
          label={t('Fin (facultatif)')}
          placeholder={t('AAAA-MM-JJ')}
          value={endDate}
          onChangeText={setEndDate}
        />
        <Field label={t('Heure')} placeholder="20:00" value={endTime} onChangeText={setEndTime} />
      </Row>

      <Field
        label={t('Lieu')}
        placeholder={t('Palais des Sports, Conakry')}
        value={location}
        onChangeText={setLocation}
      />

      <Field
        label={t('Description')}
        placeholder={t('Programme et informations pratiques')}
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 90, paddingTop: 12 }}
      />

      {editing ? (
        <Button title={t('Supprimer l’événement')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
