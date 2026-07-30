import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ImageField } from '@/components/image-field';
import { Button, Field, Row } from '@/components/ui';
import { getTeam } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, TEAM_COLORS } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function TeamForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const existing = useFetch(async () => (id ? getTeam(id) : null), [id]);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [city, setCity] = useState('');
  const [division, setDivision] = useState('');
  const [coach, setCoach] = useState('');
  const [founded, setFounded] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [isNational, setIsNational] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const team = existing.data;
    if (team && !seeded.current) {
      setName(team.name);
      setShortName(team.short_name ?? '');
      setCity(team.city ?? '');
      setDivision(team.division ?? '');
      setCoach(team.coach ?? '');
      setFounded(team.founded_year ? String(team.founded_year) : '');
      setColor(team.color ?? TEAM_COLORS[0]);
      setIsNational(team.is_national);
      setLogoUrl(team.logo_url ?? null);
      seeded.current = true;
    }
  }, [existing.data]);

  async function save() {
    if (!name.trim()) {
      setError(t("Le nom de l'équipe est obligatoire."));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const payload = {
      name: name.trim(),
      short_name: shortName.trim() || name.trim().slice(0, 3).toUpperCase(),
      city: city.trim() || null,
      division: division.trim() || null,
      coach: coach.trim() || null,
      founded_year: founded ? parseInt(founded, 10) : null,
      color,
      is_national: isNational,
      logo_url: logoUrl,
    };
    const { error: err } = editing
      ? await supabase.from('teams').update(payload).eq('id', id)
      : await supabase.from('teams').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (editing) {
      setFlash(t('Équipe mise à jour.'));
    } else {
      setFlash(t('{name} a été enregistrée.', { name: name.trim() }));
      setName('');
      setShortName('');
      setCity('');
      setDivision('');
      setCoach('');
      setFounded('');
      setLogoUrl(null);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer l’équipe'), t('Les matchs liés seront aussi supprimés. Action irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('teams').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier l’équipe') : t('Ajouter une équipe')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t("Enregistrer l'équipe")}>
      <ImageField label={t('Logo du club')} value={logoUrl} onChange={setLogoUrl} folder="teams" shape="square" />
      <Field label={t('Nom du club')} placeholder={t('Ex : SLAC Conakry')} value={name} onChangeText={setName} />
      <Row style={{ gap: 10 }}>
        <Field label={t('Sigle (3 lettres)')} placeholder="SLA" autoCapitalize="characters" maxLength={4} value={shortName} onChangeText={setShortName} />
        <Field label={t('Ville')} placeholder="Conakry" value={city} onChangeText={setCity} />
      </Row>
      <Row style={{ gap: 10 }}>
        <Field label={t('Division')} placeholder="Ligue 1 (H)" value={division} onChangeText={setDivision} />
        <Field label={t('Année de création')} placeholder="1968" keyboardType="number-pad" value={founded} onChangeText={setFounded} />
      </Row>
      <Field label={t('Entraîneur')} placeholder={t('Nom du coach')} value={coach} onChangeText={setCoach} />

      <FormLabel>{t('Couleur du club')}</FormLabel>
      <Row style={{ gap: 9 }}>
        {TEAM_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c, borderWidth: color === c ? 2 : 0, borderColor: C.accent }}
          />
        ))}
      </Row>

      <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{t('Équipe nationale')}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>{t('Sélection (Syli National)')}</Text>
        </View>
        <Switch value={isNational} onValueChange={setIsNational} trackColor={{ false: C.switchTrack, true: C.green }} thumbColor="#fff" />
      </Row>

      {editing ? (
        <Button title={t('Supprimer l’équipe')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
