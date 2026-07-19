import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listTransfers, setTransferStatus } from '@/lib/db-federation';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Transfer, TransferStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Filter = TransferStatus | 'all';

export default function AdminTransfers() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, loading, reload } = useFetch(
    () => listTransfers(filter === 'all' ? undefined : filter),
    [filter],
  );

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const transfers = data ?? [];

  async function decide(id: string, status: TransferStatus) {
    setBusyId(id);
    setError(null);
    try {
      await setTransferStatus(id, status);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(tr: Transfer) {
    Alert.alert(
      t('Approuver le transfert'),
      t('Le joueur sera officiellement rattaché à son nouveau club.'),
      [
        { text: t('Annuler'), style: 'cancel' },
        { text: t('Approuver'), onPress: () => decide(tr.id, 'approved') },
      ],
    );
  }

  return (
    <Screen>
      <Header
        title={t('Transferts')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/admin/transfer-form' as never)}>
            <Ionicons name="add" size={26} color={C.accent} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        <ChipSelect
          options={[
            { id: 'all', label: t('Tous') },
            { id: 'pending', label: t('En attente') },
            { id: 'approved', label: t('Approuvés') },
            { id: 'rejected', label: t('Rejetés') },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
      </View>

      {error ? (
        <Text style={{ color: C.red, fontSize: 13, paddingHorizontal: S.lg, paddingTop: S.md }}>{error}</Text>
      ) : null}

      {transfers.length === 0 ? (
        <Empty
          icon="swap-horizontal-outline"
          title={loading ? t('Chargement…') : t('Aucun transfert')}
          subtitle={t('Les demandes de mutation enregistrées par la fédération apparaissent ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {transfers.map((tr) => (
            <TransferCard
              key={tr.id}
              transfer={tr}
              busy={busyId === tr.id}
              onApprove={() => confirmApprove(tr)}
              onReject={() => decide(tr.id, 'rejected')}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function TransferCard({
  transfer: tr,
  busy,
  onApprove,
  onReject,
}: {
  transfer: Transfer;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useT();
  const statusLabel: Record<TransferStatus, string> = {
    pending: t('En attente'),
    approved: t('Approuvé'),
    rejected: t('Rejeté'),
  };
  const tone = tr.status === 'approved' ? 'green' : tr.status === 'rejected' ? 'red' : 'accent';

  return (
    <Card>
      <Pressable
        onPress={() => router.push(`/admin/transfer-form?id=${tr.id}` as never)}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
        <Row style={{ gap: 12 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
              {tr.player?.full_name ?? t('Joueur inconnu')}
            </Text>
            <Row style={{ gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>{tr.from_team?.name ?? t('Sans club')}</Text>
              <Ionicons name="arrow-forward" size={13} color={C.dim} />
              <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '500' }}>
                {tr.to_team?.name ?? t('Sans club')}
              </Text>
            </Row>
            <Row style={{ gap: 8, marginTop: 2 }}>
              <Pill label={statusLabel[tr.status]} tone={tone} dot />
              <Text style={{ color: C.dim, fontSize: 11.5 }}>{fullDate(tr.requested_at)}</Text>
            </Row>
            {tr.note ? (
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {tr.note}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.dim} />
        </Row>
      </Pressable>

      {tr.status === 'pending' ? (
        <Row style={{ gap: 10, marginTop: S.md }}>
          {busy ? (
            <ActivityIndicator color={C.accent} />
          ) : (
            <>
              <Decision label={t('Approuver')} icon="checkmark" color={C.accent} onPress={onApprove} />
              <Decision label={t('Rejeter')} icon="close" color={C.red} onPress={onReject} />
            </>
          )}
        </Row>
      ) : null}
    </Card>
  );
}

function Decision({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 9,
          borderRadius: R.sm,
          borderWidth: 1,
          borderColor: color,
        },
        pressed && { opacity: 0.75 },
      ]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
