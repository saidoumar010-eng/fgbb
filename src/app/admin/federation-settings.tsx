import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { Card, Field, Logo, Row } from '@/components/ui';
import { getFederationInfo, isFederationInfoEmpty, saveFederationInfo } from '@/lib/db-club';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { FederationInfo } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Informations institutionnelles affichées sur la page publique « À propos ».
export default function FederationSettings() {
  const { t } = useT();
  const existing = useFetch(() => getFederationInfo());

  const [about, setAbout] = useState('');
  const [president, setPresident] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [youtube, setYoutube] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const info = existing.data;
    if (info && !seeded.current) {
      setAbout(info.about ?? '');
      setPresident(info.president ?? '');
      setAddress(info.address ?? '');
      setPhone(info.phone ?? '');
      setEmail(info.email ?? '');
      setWebsite(info.website ?? '');
      setFacebook(info.facebook ?? '');
      setYoutube(info.youtube ?? '');
      seeded.current = true;
    }
  }, [existing.data]);

  const draft: FederationInfo = {
    about: about.trim(),
    president: president.trim(),
    address: address.trim(),
    phone: phone.trim(),
    email: email.trim(),
    website: website.trim(),
    facebook: facebook.trim(),
    youtube: youtube.trim(),
  };

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await saveFederationInfo(draft);
      setFlash(t('Informations enregistrées. La page « À propos » est à jour.'));
    } catch (e) {
      setError(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminForm
      title={t('Informations de la fédération')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={t('Enregistrer les informations')}>
      <Field
        label={t('Présentation')}
        placeholder={t('Histoire, missions et organisation de la fédération…')}
        value={about}
        onChangeText={setAbout}
        multiline
        style={{ minHeight: 130, paddingTop: 12 }}
      />
      <Field
        label={t('Président')}
        placeholder={t('Prénom et nom')}
        value={president}
        onChangeText={setPresident}
      />

      <FormLabel>{t('Coordonnées')}</FormLabel>
      <Field
        label={t('Adresse')}
        placeholder={t('Siège de la fédération, Conakry')}
        value={address}
        onChangeText={setAddress}
        multiline
        style={{ minHeight: 70, paddingTop: 11 }}
      />
      <Field
        label={t('Téléphone')}
        placeholder="+224 600 00 00 00"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <Field
        label={t('E-mail')}
        placeholder="contact@fgbb.gn"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label={t('Site web')}
        placeholder="www.fgbb.gn"
        keyboardType="url"
        autoCapitalize="none"
        value={website}
        onChangeText={setWebsite}
      />
      <Field
        label={t('Facebook')}
        placeholder="facebook.com/fgbb"
        autoCapitalize="none"
        value={facebook}
        onChangeText={setFacebook}
      />
      <Field
        label={t('YouTube')}
        placeholder="youtube.com/@fgbb"
        autoCapitalize="none"
        value={youtube}
        onChangeText={setYoutube}
      />

      <Preview info={draft} />
    </AdminForm>
  );
}

/** Aperçu fidèle de la page « À propos » : un champ vide n'y apparaît pas. */
function Preview({ info }: { info: FederationInfo }) {
  const { t } = useT();
  const lines: { icon: keyof typeof Ionicons.glyphMap; value: string }[] = [];
  if (info.address) lines.push({ icon: 'location-outline', value: info.address });
  if (info.phone) lines.push({ icon: 'call-outline', value: info.phone });
  if (info.email) lines.push({ icon: 'mail-outline', value: info.email });
  if (info.website) lines.push({ icon: 'globe-outline', value: info.website });
  if (info.facebook) lines.push({ icon: 'logo-facebook', value: info.facebook });
  if (info.youtube) lines.push({ icon: 'logo-youtube', value: info.youtube });

  return (
    <View style={{ marginTop: S.xl }}>
      <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600', marginBottom: S.sm }}>
        {t('Ce que verront les supporters')}
      </Text>
      <Card>
        <Row style={{ gap: 12 }}>
          <Logo size={38} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
              {t('Fédération Guinéenne de Basket-Ball')}
            </Text>
            {info.president ? (
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                {t('Président : {name}', { name: info.president })}
              </Text>
            ) : null}
          </View>
        </Row>

        {info.about ? (
          <Text style={{ color: C.text, fontSize: 13, lineHeight: 19, marginTop: 12 }} numberOfLines={4}>
            {info.about}
          </Text>
        ) : null}

        {lines.map((l) => (
          <Row key={l.icon} style={{ gap: 9, marginTop: 10 }}>
            <Ionicons name={l.icon} size={15} color={C.accent} />
            <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
              {l.value}
            </Text>
          </Row>
        ))}

        {isFederationInfoEmpty(info) ? (
          <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 12 }}>
            {t('Aucune information saisie : la page reste sobre, sans champ vide.')}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
