import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SectionTitle } from '@/components/ui';
import { externalUrl, listSponsors, sortByTier } from '@/lib/db-club';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Sponsor, SponsorPlacement } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/**
 * Bandeau des partenaires, inséré sur l'accueil et la page match.
 * Il ne rend rien tant qu'aucun partenaire n'est publié pour l'emplacement :
 * pas de titre orphelin ni d'espace vide dans l'écran hôte.
 */
export function SponsorBand({ placement }: { placement: SponsorPlacement }) {
  const { t } = useT();
  const { data } = useFetch(() => listSponsors(placement), [placement]);
  const list = data ?? [];

  if (list.length === 0) return null;

  return (
    <View>
      <SectionTitle title={t('Nos partenaires')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.lg, gap: 10, paddingBottom: 2 }}>
        {sortByTier(list).map((s) => (
          <SponsorTile key={s.id} sponsor={s} />
        ))}
      </ScrollView>
    </View>
  );
}

function SponsorTile({ sponsor: s }: { sponsor: Sponsor }) {
  const { t } = useT();
  const main = s.tier === 'principal';
  const href = externalUrl(s.url);
  const width = main ? 172 : 118;
  const height = main ? 78 : 58;

  return (
    <Pressable
      onPress={() => {
        if (href) WebBrowser.openBrowserAsync(href).catch(() => {});
      }}
      disabled={!href}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.8 }]}>
      {/* Plaque claire : les logos des partenaires sont dessinés pour un fond
          blanc et deviendraient illisibles sur le vert profond du thème. */}
      <View
        style={{
          height,
          borderRadius: R.md,
          backgroundColor: '#FFFFFF',
          borderWidth: main ? 1.5 : 0,
          borderColor: C.accent,
          padding: 10,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {s.logo_url ? (
          <Image source={{ uri: s.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : (
          <Text
            style={{ color: '#0B2E29', fontSize: main ? 15 : 13, fontWeight: '700', textAlign: 'center' }}
            numberOfLines={2}>
            {s.name}
          </Text>
        )}
      </View>
      <Text
        style={{
          color: main ? C.accent : C.dim,
          fontSize: 10.5,
          fontWeight: main ? '600' : '400',
          marginTop: 6,
          textAlign: 'center',
        }}
        numberOfLines={1}>
        {main ? t('Partenaire principal') : s.name}
      </Text>
    </Pressable>
  );
}
