import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Crest, Empty, Field, Header, Pill, Row, Screen } from '@/components/ui';
import { listLicenses } from '@/lib/db-federation';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { License, LicenseStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Filter = LicenseStatus | 'all';

// Nombre de jours avant expiration : au-delà de ce seuil, la fédération doit
// relancer le club pour le renouvellement.
const EXPIRY_WARNING_DAYS = 30;

function statusTone(status: LicenseStatus): 'accent' | 'red' | 'green' | 'neutral' {
  switch (status) {
    case 'valid':
      return 'green';
    case 'suspended':
      return 'red';
    case 'expired':
      return 'neutral';
    default:
      return 'accent';
  }
}

function daysUntil(date?: string | null) {
  if (!date) return null;
  const ts = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

export default function AdminLicenses() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const { data, loading, reload } = useFetch(
    () => listLicenses(filter === 'all' ? undefined : filter),
    [filter],
  );

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const statusLabel: Record<LicenseStatus, string> = {
    pending: t('En attente'),
    valid: t('Valide'),
    suspended: t('Suspendue'),
    expired: t('Expirée'),
  };

  const licenses = useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((l) => (l.player?.full_name ?? '').toLowerCase().includes(q));
  }, [data, search]);

  return (
    <Screen>
      <Header
        title={t('Licences')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/license-form' as never)}>
            <Ionicons name="add" size={26} color={C.accent} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        <ChipSelect
          options={[
            { id: 'all', label: t('Toutes') },
            { id: 'pending', label: t('En attente') },
            { id: 'valid', label: t('Valides') },
            { id: 'suspended', label: t('Suspendues') },
            { id: 'expired', label: t('Expirées') },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
        <Field
          label={t('Rechercher')}
          placeholder={t('Nom du joueur')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {licenses.length === 0 ? (
        <Empty
          icon="card-outline"
          title={loading ? t('Chargement…') : t('Aucune licence')}
          subtitle={t('Les licences enregistrées par la fédération apparaissent ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {licenses.map((l) => (
            <LicenseCard key={l.id} license={l} label={statusLabel[l.status]} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function LicenseCard({ license: l, label }: { license: License; label: string }) {
  const { t } = useT();
  const name = l.player?.full_name ?? t('Joueur inconnu');
  const left = daysUntil(l.expires_at);
  const expiringSoon = l.status === 'valid' && left !== null && left >= 0 && left <= EXPIRY_WARNING_DAYS;

  return (
    <Pressable
      onPress={() => router.push(`/admin/license-form?id=${l.id}` as never)}
      style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      <Card style={expiringSoon ? { borderColor: 'rgba(226,59,59,0.45)' } : undefined}>
        <Row style={{ gap: 12 }}>
          <Crest label={name.slice(0, 2).toUpperCase()} color={C.surface2} size={34} round image={l.player?.photo_url} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{name}</Text>
            <Text style={{ color: C.dim, fontSize: 12 }}>
              {[l.team?.name, l.number ? `N° ${l.number}` : null, l.season?.name].filter(Boolean).join(' · ') ||
                t('Aucune information complémentaire')}
            </Text>
            <Row style={{ gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              <Pill label={label} tone={statusTone(l.status)} dot />
              {l.document_url ? (
                <Row style={{ gap: 4 }}>
                  <Ionicons name="document-attach-outline" size={13} color={C.dim} />
                  <Text style={{ color: C.dim, fontSize: 11 }}>{t('Justificatif')}</Text>
                </Row>
              ) : null}
            </Row>
            {expiringSoon ? (
              <Text style={{ color: C.red, fontSize: 11.5, marginTop: 2 }}>
                {left === 0
                  ? t('Expire aujourd’hui')
                  : t('Expire dans {n} jours ({date})', { n: left, date: fullDate(l.expires_at) })}
              </Text>
            ) : l.expires_at ? (
              <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>
                {t('Valable jusqu’au {date}', { date: fullDate(l.expires_at) })}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.dim} />
        </Row>
      </Card>
    </Pressable>
  );
}
