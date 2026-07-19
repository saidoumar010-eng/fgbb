import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import {
  deleteSponsor,
  getSponsor,
  PLACEMENT_LABELS,
  TIER_LABELS,
  TIER_ORDER,
  upsertSponsor,
} from '@/lib/db-club';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { SponsorPlacement, SponsorTier } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const PLACEMENTS: SponsorPlacement[] = ['accueil', 'match', 'tous'];

export default function SponsorForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getSponsor(id) : null), [id]);

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState<SponsorTier>('partenaire');
  const [placement, setPlacement] = useState<SponsorPlacement>('tous');
  const [position, setPosition] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const s = existing.data;
    if (s && !seeded.current) {
      setName(s.name);
      setLogoUrl(s.logo_url);
      setUrl(s.url ?? '');
      setTier(s.tier);
      setPlacement(s.placement);
      setPosition(String(s.position));
      setIsActive(s.is_active);
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!name.trim()) {
      setError(t('Le nom du partenaire est obligatoire.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertSponsor({
        id,
        name: name.trim(),
        logo_url: logoUrl,
        url: url.trim() || null,
        tier,
        placement,
        position: position ? parseInt(position, 10) || 0 : 0,
        is_active: isActive,
      });
      if (editing) {
        setFlash(t('Partenaire mis à jour.'));
      } else {
        setFlash(t('{name} a été ajouté aux partenaires.', { name: name.trim() }));
        setName('');
        setLogoUrl(null);
        setUrl('');
        setPosition('');
      }
    } catch (e) {
      setError(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(t('Supprimer le partenaire'), t('Son logo disparaîtra de tous les écrans.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSponsor(id);
            router.back();
          } catch (e) {
            setError(errorMessage(e, t('Suppression impossible.')));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier le partenaire') : t('Ajouter un partenaire')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer le partenaire')}>
      <ImageField label={t('Logo du partenaire')} value={logoUrl} onChange={setLogoUrl} folder="sponsors" shape="wide" />

      <Field label={t('Nom')} placeholder={t('Nom de l’entreprise')} value={name} onChangeText={setName} />
      <Field
        label={t('Lien')}
        placeholder="www.exemple.com"
        autoCapitalize="none"
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />

      <FormLabel>{t('Niveau')}</FormLabel>
      <ChipSelect
        options={TIER_ORDER.map((x) => ({ id: x, label: t(TIER_LABELS[x]) }))}
        value={tier}
        onChange={(v) => setTier(v as SponsorTier)}
        wrap
      />

      <FormLabel>{t('Emplacement')}</FormLabel>
      <ChipSelect
        options={PLACEMENTS.map((x) => ({ id: x, label: t(PLACEMENT_LABELS[x]) }))}
        value={placement}
        onChange={(v) => setPlacement(v as SponsorPlacement)}
        wrap
      />

      <Field
        label={t('Ordre d’affichage')}
        placeholder="0"
        keyboardType="number-pad"
        value={position}
        onChangeText={setPosition}
      />
      <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 6 }}>
        {t('Le plus petit nombre s’affiche en premier, à niveau égal.')}
      </Text>

      <Row style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{t('Visible dans l’application')}</Text>
          <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>
            {t('Désactivez pour retirer le logo sans supprimer la fiche.')}
          </Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ false: '#2A3140', true: C.green }}
          thumbColor="#fff"
        />
      </Row>

      {editing ? (
        <Button title={t('Supprimer le partenaire')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
