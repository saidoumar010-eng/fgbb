import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Card, Crest, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { approveRegistration, listRegistrations, rejectRegistration } from '@/lib/db-federation';
import { categoryLabel, fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Category, ClubRegistration, RegistrationStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Filter = RegistrationStatus | 'all';

// `categoryLabel` renvoie la clé brute pour « autre » : on complète l'affichage.
function catLabel(c: Category, t: (fr: string) => string) {
  return c === 'autre' ? t('Autre') : t(categoryLabel(c));
}

export default function AdminRegistrations() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { data, loading, reload } = useFetch(
    () => listRegistrations(filter === 'all' ? undefined : filter),
    [filter],
  );

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const registrations = data ?? [];

  async function approve(reg: ClubRegistration) {
    setBusyId(reg.id);
    setError(null);
    setFlash(null);
    try {
      await approveRegistration(reg.id);
      setFlash(t('{club} a été inscrit et ajouté aux équipes.', { club: reg.club_name }));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(reg: ClubRegistration) {
    setBusyId(reg.id);
    setError(null);
    setFlash(null);
    try {
      await rejectRegistration(reg.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(reg: ClubRegistration) {
    Alert.alert(
      t('Approuver l’inscription'),
      t('Le club sera créé dans la liste des équipes de la fédération.'),
      [
        { text: t('Annuler'), style: 'cancel' },
        { text: t('Approuver'), onPress: () => approve(reg) },
      ],
    );
  }

  return (
    <Screen>
      <Header
        title={t('Inscriptions des clubs')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        <ChipSelect
          options={[
            { id: 'pending', label: t('En attente') },
            { id: 'approved', label: t('Approuvées') },
            { id: 'rejected', label: t('Rejetées') },
            { id: 'all', label: t('Toutes') },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
      </View>

      {flash ? (
        <Text style={{ color: C.green, fontSize: 13, paddingHorizontal: S.lg, paddingTop: S.md }}>{flash}</Text>
      ) : null}
      {error ? (
        <Text style={{ color: C.red, fontSize: 13, paddingHorizontal: S.lg, paddingTop: S.md }}>{error}</Text>
      ) : null}

      {registrations.length === 0 ? (
        <Empty
          icon="clipboard-outline"
          title={loading ? t('Chargement…') : t('Aucune demande')}
          subtitle={t('Les demandes d’inscription déposées par les clubs apparaissent ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 10 }}>
          {registrations.map((reg) => (
            <RegistrationCard
              key={reg.id}
              registration={reg}
              busy={busyId === reg.id}
              onApprove={() => confirmApprove(reg)}
              onReject={() => reject(reg)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RegistrationCard({
  registration: reg,
  busy,
  onApprove,
  onReject,
}: {
  registration: ClubRegistration;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useT();
  const statusLabel: Record<RegistrationStatus, string> = {
    pending: t('En attente'),
    approved: t('Approuvée'),
    rejected: t('Rejetée'),
  };
  const tone = reg.status === 'approved' ? 'green' : reg.status === 'rejected' ? 'red' : 'accent';

  return (
    <Card>
      <Row style={{ gap: 12, alignItems: 'flex-start' }}>
        <Crest label={reg.club_name.slice(0, 2).toUpperCase()} color={C.surface2} size={38} image={reg.logo_url} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{reg.club_name}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>
            {[reg.city, catLabel(reg.category, t), reg.competition?.name].filter(Boolean).join(' · ')}
          </Text>
          <Row style={{ gap: 8, marginTop: 3 }}>
            <Pill label={statusLabel[reg.status]} tone={tone} dot />
            <Text style={{ color: C.dim, fontSize: 11.5 }}>{fullDate(reg.created_at)}</Text>
          </Row>
        </View>
      </Row>

      <View
        style={{
          marginTop: S.md,
          paddingTop: S.md,
          borderTopWidth: 1,
          borderTopColor: C.border,
          gap: 7,
        }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Contact')}</Text>
        <ContactLine icon="person-outline" text={reg.contact_name} />
        <ContactLine icon="call-outline" text={reg.contact_phone} href={reg.contact_phone ? `tel:${reg.contact_phone}` : null} />
        <ContactLine icon="mail-outline" text={reg.contact_email} href={reg.contact_email ? `mailto:${reg.contact_email}` : null} />
        {reg.note ? (
          <Row style={{ gap: 8, alignItems: 'flex-start' }}>
            <Ionicons name="chatbox-ellipses-outline" size={14} color={C.dim} style={{ marginTop: 2 }} />
            <Text style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>{reg.note}</Text>
          </Row>
        ) : null}
      </View>

      {reg.status === 'pending' ? (
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

function ContactLine({
  icon,
  text,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text?: string | null;
  href?: string | null;
}) {
  const { t } = useT();
  const body = (
    <Row style={{ gap: 8 }}>
      <Ionicons name={icon} size={14} color={C.dim} />
      <Text style={{ color: text ? (href ? C.accent : C.text) : C.dim, fontSize: 12.5 }}>
        {text || t('Non renseigné')}
      </Text>
    </Row>
  );
  if (!text || !href) return body;
  return (
    <Pressable onPress={() => Linking.openURL(href).catch(() => {})} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
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
