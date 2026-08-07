import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Card, Field, Row } from '@/components/ui';
import {
  deleteReferee,
  getReferee,
  getRefereeContact,
  REFEREE_LEVELS,
  upsertReferee,
  upsertRefereeContact,
} from '@/lib/db-officials';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { RefereeLevel } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function RefereeForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getReferee(id) : null), [id]);
  const contact = useFetch(async () => (id ? getRefereeContact(id) : null), [id]);

  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [level, setLevel] = useState<RefereeLevel>('regional');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);
  const seededContact = useRef(false);

  useEffect(() => {
    const r = existing.data;
    if (r && !seeded.current) {
      setFullName(r.full_name);
      setCity(r.city ?? '');
      setLevel(r.level);
      setLicenseNumber(r.license_number ?? '');
      setPhotoUrl(r.photo_url ?? null);
      setIsActive(r.is_active);
      seeded.current = true;
    }
  }, [existing.data]);

  useEffect(() => {
    const c = contact.data;
    if (c && !seededContact.current) {
      setPhone(c.phone ?? '');
      setEmail(c.email ?? '');
      setAddress(c.address ?? '');
      seededContact.current = true;
    }
  }, [contact.data]);

  async function save() {
    if (!fullName.trim()) {
      setError(t("Le nom de l'arbitre est obligatoire."));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const saved = await upsertReferee(
        {
          full_name: fullName.trim(),
          city: city.trim() || null,
          level,
          license_number: licenseNumber.trim() || null,
          photo_url: photoUrl,
          is_active: isActive,
        },
        id ?? null,
      );
      // Les coordonnées vivent dans une table à part : on ne l'écrit que si
      // au moins un champ est renseigné, pour ne pas créer de ligne vide.
      if (phone.trim() || email.trim() || address.trim()) {
        await upsertRefereeContact({
          referee_id: saved.id,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        });
      }
      if (editing) {
        setFlash(t('Arbitre mis à jour.'));
      } else {
        setFlash(t('{name} a été ajouté au corps arbitral.', { name: fullName.trim() }));
        setFullName('');
        setCity('');
        setLicenseNumber('');
        setPhotoUrl(null);
        setPhone('');
        setEmail('');
        setAddress('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t("Supprimer l'arbitre"), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteReferee(id);
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
      title={editing ? t("Modifier l'arbitre") : t('Ajouter un arbitre')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t("Enregistrer l'arbitre")}>
      <ImageField
        label={t("Photo de l'arbitre")}
        value={photoUrl}
        onChange={setPhotoUrl}
        folder="referees"
        shape="circle"
      />
      <Field
        label={t('Nom complet')}
        placeholder={t('Prénom et nom')}
        value={fullName}
        onChangeText={setFullName}
      />

      <FormLabel>{t('Niveau')}</FormLabel>
      <ChipSelect
        options={REFEREE_LEVELS.map((l) => ({ id: l.id, label: t(l.label) }))}
        value={level}
        onChange={(v) => setLevel(v as RefereeLevel)}
        wrap
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Ville')} placeholder="Conakry" value={city} onChangeText={setCity} />
        <Field
          label={t('Numéro de licence')}
          placeholder="ARB-2026-001"
          autoCapitalize="characters"
          value={licenseNumber}
          onChangeText={setLicenseNumber}
        />
      </Row>

      <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{t('Arbitre actif')}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>{t('Seuls les actifs sont proposés à la désignation')}</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ false: C.switchTrack, true: C.green }}
          thumbColor="#fff"
        />
      </Row>

      <Card style={{ marginTop: S.xl, borderColor: 'rgba(226,59,59,0.28)' }}>
        <Row style={{ gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={16} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{t('Coordonnées')}</Text>
        </Row>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
          {t('Visible par la fédération uniquement')}
        </Text>
        <Field
          label={t('Téléphone')}
          placeholder="+224 6XX XX XX XX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Field
          label={t('E-mail')}
          placeholder="arbitre@exemple.gn"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field label={t('Adresse')} placeholder={t('Quartier, commune')} value={address} onChangeText={setAddress} />
      </Card>

      {editing ? (
        <Button title={t("Supprimer l'arbitre")} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
