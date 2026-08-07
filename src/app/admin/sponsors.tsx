import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { listSponsors, PLACEMENT_LABELS, reorderSponsor, TIER_LABELS } from '@/lib/db-club';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Portefeuille des partenaires : ordre d'affichage, niveau, emplacement.
export default function AdminSponsors() {
  const { t } = useT();
  const sponsors = useFetch(() => listSponsors(undefined, { includeInactive: true }));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = sponsors.data ?? [];

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= list.length || busy) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setErr(null);
    try {
      // Les positions saisies à la main peuvent être toutes identiques :
      // on réécrit l'ordre complet plutôt que d'échanger deux valeurs.
      await Promise.all(next.map((s, i) => (s.position === i ? null : reorderSponsor(s.id, i))));
      await sponsors.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Impossible de réordonner les partenaires.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header
        title={t('Partenaires')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Button
          title={t('Ajouter un partenaire')}
          icon="add"
          onPress={() => router.push('/admin/sponsor-form' as never)}
        />

        {err ? <Text style={{ color: C.red, fontSize: 12.5 }}>{err}</Text> : null}

        {list.length === 0 ? (
          <Empty
            icon="ribbon-outline"
            title={sponsors.loading ? t('Chargement…') : t('Aucun partenaire')}
            subtitle={sponsors.loading ? undefined : t('Les logos ajoutés ici apparaissent sur l’accueil et la page match.')}
          />
        ) : (
          list.map((s, i) => (
            <Card key={s.id}>
              <Row style={{ gap: 12 }}>
                <Pressable
                  onPress={() => router.push(`/admin/sponsor-form?id=${s.id}` as never)}
                  style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.7 }]}>
                  <Row style={{ gap: 12 }}>
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
                        opacity: s.is_active ? 1 : 0.4,
                      }}>
                      {s.logo_url ? (
                        <Image
                          source={{ uri: s.logo_url }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="contain"
                        />
                      ) : (
                        <Ionicons name="image-outline" size={16} color="#7C968F" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 12 }} numberOfLines={1}>
                        {`${t(TIER_LABELS[s.tier])} · ${t(PLACEMENT_LABELS[s.placement])}`}
                      </Text>
                    </View>
                  </Row>
                </Pressable>

                <View style={{ gap: 6 }}>
                  <ArrowButton icon="chevron-up" disabled={i === 0 || busy} onPress={() => move(i, -1)} />
                  <ArrowButton
                    icon="chevron-down"
                    disabled={i === list.length - 1 || busy}
                    onPress={() => move(i, 1)}
                  />
                </View>
              </Row>

              {!s.is_active ? (
                <Row style={{ marginTop: 10 }}>
                  <Pill label={t('Masqué')} tone="neutral" />
                </Row>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

function ArrowButton({
  icon,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: 32,
          height: 26,
          borderRadius: R.sm,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.3 : 1,
        },
        pressed && { opacity: 0.6 },
      ]}>
      <Ionicons name={icon} size={16} color={C.muted} />
    </Pressable>
  );
}
