import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { Button, Field, Row } from '@/components/ui';
import { deleteSeason, getSeason, upsertSeason } from '@/lib/db-federation';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function SeasonForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getSeason(id) : null), [id]);

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const s = existing.data;
    if (s && !seeded.current) {
      setName(s.name);
      setStart(s.start_date ?? '');
      setEnd(s.end_date ?? '');
      setIsCurrent(s.is_current);
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!name.trim()) {
      setError(t('Le nom de la saison est obligatoire.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertSeason({
        id,
        name: name.trim(),
        start_date: start.trim() || null,
        end_date: end.trim() || null,
        is_current: isCurrent,
      });
      if (editing) {
        setFlash(t('Saison mise à jour.'));
      } else {
        setFlash(t('La saison {name} a été créée.', { name: name.trim() }));
        setName('');
        setStart('');
        setEnd('');
        setIsCurrent(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer la saison'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteSeason(id);
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
      title={editing ? t('Modifier la saison') : t('Nouvelle saison')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer la saison')}>
      <Field
        label={t('Nom de la saison')}
        placeholder="2025-2026"
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Début')} placeholder={t('AAAA-MM-JJ')} value={start} onChangeText={setStart} />
        <Field label={t('Fin')} placeholder={t('AAAA-MM-JJ')} value={end} onChangeText={setEnd} />
      </Row>

      <FormLabel>{t('Statut')}</FormLabel>
      <Pressable
        onPress={() => setIsCurrent((v) => !v)}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: isCurrent ? C.accent : C.border,
            borderRadius: R.md,
            padding: S.md,
          },
          pressed && { opacity: 0.85 },
        ]}>
        <Ionicons
          name={isCurrent ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={isCurrent ? C.accent : C.dim}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{t('Saison en cours')}</Text>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
            {t('Une seule saison peut être en cours : l’ancienne sera automatiquement désactivée.')}
          </Text>
        </View>
      </Pressable>

      {editing ? (
        <Button title={t('Supprimer la saison')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
