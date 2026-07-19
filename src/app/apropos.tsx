import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Logo, Row, Screen, SectionTitle } from '@/components/ui';
import {
  externalUrl,
  getFederationInfo,
  isFederationInfoEmpty,
  listSponsors,
  TIER_GROUP_LABELS,
  TIER_ORDER,
} from '@/lib/db-club';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Sponsor, SponsorTier } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Vitrine institutionnelle : présentation, coordonnées et partenaires.
// Chaque bloc disparaît tant que la fédération n'a rien saisi — la page reste
// présentable dès la première installation.
export default function AProposScreen() {
  const { t } = useT();
  const federation = useFetch(() => getFederationInfo());
  const sponsors = useFetch(() => listSponsors());
  const [refreshing, setRefreshing] = useState(false);

  const info = federation.data ?? {};
  const nothingYet = isFederationInfoEmpty(federation.data);
  const version = Constants.expoConfig?.version;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([federation.reload(), sponsors.reload()]);
    setRefreshing(false);
  };

  const contacts: ContactDef[] = [];
  if (info.address) {
    contacts.push({ icon: 'location-outline', label: t('Adresse'), value: info.address });
  }
  if (info.phone) {
    const phone = info.phone;
    contacts.push({
      icon: 'call-outline',
      label: t('Téléphone'),
      value: phone,
      // Les numéros sont saisis avec des espaces de lisibilité que `tel:` refuse.
      onPress: () => openLink(`tel:${phone.replace(/[\s.]/g, '')}`),
    });
  }
  if (info.email) {
    const email = info.email;
    contacts.push({
      icon: 'mail-outline',
      label: t('E-mail'),
      value: email,
      onPress: () => openLink(`mailto:${email.trim()}`),
    });
  }
  if (info.website) {
    contacts.push({
      icon: 'globe-outline',
      label: t('Site web'),
      value: info.website,
      onPress: () => openWeb(info.website),
    });
  }
  if (info.facebook) {
    contacts.push({
      icon: 'logo-facebook',
      label: t('Facebook'),
      value: info.facebook,
      onPress: () => openWeb(info.facebook),
    });
  }
  if (info.youtube) {
    contacts.push({
      icon: 'logo-youtube',
      label: t('YouTube'),
      value: info.youtube,
      onPress: () => openWeb(info.youtube),
    });
  }

  const partners = sponsors.data ?? [];
  const groups = TIER_ORDER.map((tier) => ({
    tier,
    items: partners.filter((s) => s.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('À propos')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg }}>
        <Card style={{ alignItems: 'center', paddingVertical: S.xl }}>
          <Logo size={84} />
          <Text
            style={{
              color: C.text,
              fontSize: 17,
              fontWeight: '700',
              marginTop: 14,
              textAlign: 'center',
              paddingHorizontal: S.md,
            }}>
            {t('Fédération Guinéenne de Basket-Ball')}
          </Text>
          {/* Rappel discret des couleurs nationales sous le nom officiel. */}
          <Row style={{ gap: 4, marginTop: 11 }}>
            {[C.flagRed, C.flagYellow, C.flagGreen].map((c) => (
              <View key={c} style={{ width: 24, height: 3, borderRadius: 2, backgroundColor: c }} />
            ))}
          </Row>
          {info.president ? (
            <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 13, textAlign: 'center' }}>
              {t('Président : {name}', { name: info.president })}
            </Text>
          ) : null}
        </Card>
      </View>

      {info.about ? (
        <>
          <SectionTitle title={t('La fédération')} />
          <View style={{ paddingHorizontal: S.lg }}>
            <Card>
              <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{info.about}</Text>
            </Card>
          </View>
        </>
      ) : null}

      {contacts.length > 0 ? (
        <>
          <SectionTitle title={t('Nous contacter')} />
          <View style={{ paddingHorizontal: S.lg }}>
            <Card style={{ paddingVertical: 2 }}>
              {contacts.map((c, i) => (
                <ContactRow key={c.label} def={c} last={i === contacts.length - 1} />
              ))}
            </Card>
          </View>
        </>
      ) : null}

      {nothingYet && !federation.loading ? (
        <Empty
          icon="information-circle-outline"
          title={t('Informations à venir')}
          subtitle={t('Les coordonnées de la fédération seront publiées prochainement.')}
        />
      ) : null}

      {groups.length > 0 ? (
        <>
          <SectionTitle title={t('Partenaires officiels')} />
          <View style={{ paddingHorizontal: S.lg, gap: 12 }}>
            {groups.map((g) => (
              <PartnerGroup key={g.tier} tier={g.tier} items={g.items} />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ alignItems: 'center', paddingHorizontal: S.lg, paddingTop: S.xl, gap: 4 }}>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>{t('FGBB · Conakry, Guinée')}</Text>
        {version ? (
          <Text style={{ color: C.dim, fontSize: 11.5 }}>{t('Version {v}', { v: version })}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

interface ContactDef {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}

function ContactRow({ def, last }: { def: ContactDef; last: boolean }) {
  const body: ReactNode = (
    <Row
      style={{
        paddingVertical: 13,
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.border,
      }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: C.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={def.icon} size={17} color={C.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>{def.label}</Text>
        <Text style={{ color: C.text, fontSize: 14 }}>{def.value}</Text>
      </View>
      {def.onPress ? <Ionicons name="chevron-forward" size={16} color={C.dim} /> : null}
    </Row>
  );

  if (!def.onPress) return <View>{body}</View>;
  return (
    <Pressable onPress={def.onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

function PartnerGroup({ tier, items }: { tier: SponsorTier; items: Sponsor[] }) {
  const { t } = useT();
  return (
    <Card style={{ paddingVertical: 2 }}>
      <Text style={{ color: C.accent, fontSize: 11.5, fontWeight: '600', marginTop: 12 }}>
        {t(TIER_GROUP_LABELS[tier])}
      </Text>
      {items.map((s, i) => (
        <PartnerRow key={s.id} sponsor={s} last={i === items.length - 1} />
      ))}
    </Card>
  );
}

function PartnerRow({ sponsor: s, last }: { sponsor: Sponsor; last: boolean }) {
  const href = externalUrl(s.url);
  return (
    <Pressable
      onPress={() => {
        if (href) openWeb(href);
      }}
      disabled={!href}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Row
        style={{
          paddingVertical: 12,
          gap: 12,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: C.border,
        }}>
        <View
          style={{
            width: 58,
            height: 40,
            borderRadius: R.sm,
            backgroundColor: '#FFFFFF',
            padding: 5,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
          {s.logo_url ? (
            <Image source={{ uri: s.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <Text style={{ color: '#0B2E29', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
              {s.name.slice(0, 8)}
            </Text>
          )}
        </View>
        <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
          {s.name}
        </Text>
        {href ? <Ionicons name="open-outline" size={16} color={C.dim} /> : null}
      </Row>
    </Pressable>
  );
}

function openLink(url: string) {
  Linking.openURL(url).catch(() => {});
}

function openWeb(raw: string | null | undefined) {
  const href = externalUrl(raw);
  if (href) WebBrowser.openBrowserAsync(href).catch(() => {});
}
