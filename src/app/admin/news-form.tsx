import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import { getNewsItem } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { notifySubscribers } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

const CATS = [
  { id: 'officiel', label: 'Officiel' },
  { id: 'sélection', label: 'Sélection' },
  { id: 'ligue 1', label: 'Ligue 1' },
  { id: 'coupe', label: 'Coupe' },
];

export default function NewsForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getNewsItem(id) : null), [id]);
  const { t } = useT();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('officiel');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('Service communication FGBB');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const n = existing.data;
    if (n && !seeded.current) {
      setTitle(n.title);
      setCategory(n.category ?? 'officiel');
      setBody(n.body ?? '');
      setAuthor(n.author ?? '');
      setCoverUrl(n.cover_url ?? null);
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!title.trim()) {
      setError(t('Le titre est obligatoire.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const payload = {
      title: title.trim(),
      category,
      body: body.trim() || null,
      author: author.trim() || null,
      cover_url: coverUrl,
    };
    const { error: err } = editing
      ? await supabase.from('news').update(payload).eq('id', id)
      : await supabase.from('news').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (!editing && notify) {
      await notifySubscribers({ title: 'Nouvelle actualité FGBB', body: title.trim() });
    }
    if (editing) {
      setFlash(t('Actualité mise à jour.'));
    } else {
      setFlash(t('Actualité publiée.'));
      setTitle('');
      setBody('');
      setCoverUrl(null);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer l’actualité'), t('Action irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('news').delete().eq('id', id);
          goBack();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier l’actualité') : t('Publier une actualité')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Publier')}>
      <ImageField label={t('Image de couverture')} value={coverUrl} onChange={setCoverUrl} folder="news" shape="wide" />
      <Field label={t('Titre')} placeholder={t("Titre de l'article")} value={title} onChangeText={setTitle} />

      <FormLabel>{t('Catégorie')}</FormLabel>
      <ChipSelect options={CATS.map((o) => ({ ...o, label: t(o.label) }))} value={category} onChange={setCategory} wrap />

      <Field
        label={t('Contenu')}
        placeholder={t('Rédige le communiqué…')}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
        style={{ height: 130, textAlignVertical: 'top', paddingTop: 11 } as never}
      />
      <Field label={t('Auteur')} placeholder={t('Service communication')} value={author} onChangeText={setAuthor} />

      {!editing ? (
        <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14 }}>{t('Notifier les supporters')}</Text>
            <Text style={{ color: C.dim, fontSize: 12 }}>{t('Alerte à tous les abonnés')}</Text>
          </View>
          <Switch value={notify} onValueChange={setNotify} trackColor={{ false: C.switchTrack, true: C.green }} thumbColor="#fff" />
        </Row>
      ) : null}

      {editing ? (
        <Button title={t('Supprimer l’actualité')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
