import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { listClubLicenses } from '@/lib/db-club-space';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { License, LicenseStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Couleur et libellé par statut. Le club ne fait que consulter : aucune action.
const STATUS: Record<LicenseStatus, { label: string; color: string }> = {
  valid: { label: 'Valide', color: C.green },
  pending: { label: 'En attente', color: C.flagYellow },
  suspended: { label: 'Suspendue', color: C.red },
  expired: { label: 'Expirée', color: C.red },
};

// Ordre d'affichage : ce qui demande une action de la fédération d'abord.
const ORDER: Record<LicenseStatus, number> = { suspended: 0, expired: 1, pending: 2, valid: 3 };

export default function ClubLicensesScreen() {
  const { t } = useT();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const { data, loading, reload } = useFetch(
    () => (team ? listClubLicenses(team) : Promise.resolve([] as License[])),
    [team],
  );
  const [refreshing, setRefreshing] = useState(false);

  const rows = [...(data ?? [])].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || (a.player?.full_name ?? '').localeCompare(b.player?.full_name ?? ''),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Licences')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {rows.length === 0 ? (
        <Empty
          icon="ribbon-outline"
          title={loading ? t('Chargement…') : t('Aucune licence')}
          subtitle={
            loading ? undefined : t('Les licences délivrées par la fédération pour ton effectif apparaîtront ici.')
          }
        />
      ) : (
        <View style={{ padding: S.lg, gap: 9 }}>
          <Text style={{ color: C.dim, fontSize: 12, marginBottom: 2 }}>
            {t('Délivrées par la fédération. Consultation seule.')}
          </Text>
          {rows.map((l) => (
            <LicenseCard key={l.id} license={l} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function LicenseCard({ license: l }: { license: License }) {
  const { t } = useT();
  const s = STATUS[l.status];
  // Une licence valide qui expire dans moins de 30 jours mérite un avertissement.
  const expMs = l.expires_at ? new Date(l.expires_at).getTime() : null;
  const soon = l.status === 'valid' && expMs != null && expMs - Date.now() < 30 * 24 * 3600 * 1000;

  return (
    <Card>
      <Row style={{ gap: 12 }}>
        <Crest
          label={(l.player?.full_name ?? '—').slice(0, 2).toUpperCase()}
          color={C.surface2}
          size={34}
          round
          image={l.player?.photo_url}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
            {l.player?.full_name ?? t('Joueur inconnu')}
          </Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>
            {l.number ? t('N° {n}', { n: l.number }) : t('Sans numéro')}
            {l.season?.name ? ` · ${l.season.name}` : ''}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: R.pill,
            backgroundColor: `${s.color}22`,
          }}>
          <Text style={{ color: s.color, fontSize: 11.5, fontWeight: '700' }}>{t(s.label)}</Text>
        </View>
      </Row>

      {(l.issued_at || l.expires_at) && (
        <Row style={{ gap: 14, marginTop: 10 }}>
          {l.issued_at ? (
            <Text style={{ color: C.dim, fontSize: 11.5 }}>
              {t('Délivrée le {date}', { date: fullDate(l.issued_at) })}
            </Text>
          ) : null}
          {l.expires_at ? (
            <Text style={{ color: soon || l.status === 'expired' ? C.red : C.dim, fontSize: 11.5 }}>
              {t('Expire le {date}', { date: fullDate(l.expires_at) })}
              {soon ? ` · ${t('bientôt')}` : ''}
            </Text>
          ) : null}
        </Row>
      )}

      {l.note ? <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{l.note}</Text> : null}
    </Card>
  );
}
