import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import {
  deleteMediaItem,
  fromIso,
  getMediaItem,
  MEDIA_KINDS,
  toIso,
  upsertMediaItem,
} from '@/lib/db-content';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { MediaKind } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';
import { videoThumbnail } from '@/lib/video';

export default function MediaForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getMediaItem(id) : null), [id]);

  const [kind, setKind] = useState<MediaKind>('interview');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState('');
  const [publishedDate, setPublishedDate] = useState(fromIso(new Date().toISOString()).date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const m = existing.data;
    if (m && !seeded.current) {
      setKind(m.kind);
      setTitle(m.title);
      setUrl(m.url);
      setDescription(m.description ?? '');
      setCoverUrl(m.cover_url ?? null);
      setDuration(m.duration_min ? String(m.duration_min) : '');
      setPublishedDate(fromIso(m.published_at).date);
      seeded.current = true;
    }
  }, [existing.data]);

  // Une vidéo YouTube fournit sa vignette : inutile d'en envoyer une.
  const autoThumb = !coverUrl ? videoThumbnail(url) : null;

  async function save() {
    if (!title.trim()) {
      setError(t('Le titre du média est obligatoire.'));
      return;
    }
    if (!url.trim()) {
      setError(t('Le lien du média est obligatoire.'));
      return;
    }
    const published = toIso(publishedDate);
    if (!published) {
      setError(t('Indique une date de publication au format AAAA-MM-JJ.'));
      return;
    }

    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertMediaItem({
        id,
        kind,
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        cover_url: coverUrl,
        duration_min: duration ? parseInt(duration, 10) : null,
        published_at: published,
      });
      if (editing) {
        setFlash(t('Média mis à jour.'));
      } else {
        setFlash(t('{title} a été publié dans la médiathèque.', { title: title.trim() }));
        setTitle('');
        setUrl('');
        setDescription('');
        setCoverUrl(null);
        setDuration('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer le média'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteMediaItem(id);
            goBack();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Erreur de chargement'));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier le média') : t('Nouveau média')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Publier le média')}>
      <FormLabel>{t('Type')}</FormLabel>
      <ChipSelect
        options={MEDIA_KINDS.map((k) => ({ id: k.id, label: t(k.one) }))}
        value={kind}
        onChange={(v) => setKind(v as MediaKind)}
        wrap
      />

      <Field
        label={t('Titre')}
        placeholder={t('Entretien avec le sélectionneur national')}
        value={title}
        onChangeText={setTitle}
      />

      <Field
        label={t('Lien')}
        placeholder="https://youtube.com/watch?v=…"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />

      <ImageField label={t('Vignette')} value={coverUrl} onChange={setCoverUrl} folder="media" shape="wide" />
      {autoThumb ? (
        <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 4 }}>
          {t('Sans vignette, celle de YouTube sera utilisée automatiquement.')}
        </Text>
      ) : null}

      <Row style={{ gap: 10 }}>
        <Field
          label={t('Durée (min)')}
          placeholder="24"
          keyboardType="number-pad"
          value={duration}
          onChangeText={setDuration}
        />
        <Field
          label={t('Publication')}
          placeholder={t('AAAA-MM-JJ')}
          value={publishedDate}
          onChangeText={setPublishedDate}
        />
      </Row>

      <Field
        label={t('Description')}
        placeholder={t('Résumé du contenu')}
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 90, paddingTop: 12 }}
      />

      {editing ? (
        <Button title={t('Supprimer le média')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
