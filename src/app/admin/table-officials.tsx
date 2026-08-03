import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Crest, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/db-fan';
import { listTableOfficials, setUserRole } from '@/lib/db-matchday';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Officiels de table, côté fédération.
 *
 * Accorder le rôle « table technique » à un compte lui ouvre la préparation du
 * jour de match (désignation des arbitres, feuille de match, programmation et
 * gestion des matchs) — sans l'accès admin complet. Réservé aux administrateurs,
 * la base le fait respecter (fonction set_user_role, migration 0022).
 */
export default function AdminTableOfficials() {
  const { t } = useT();
  const officials = useFetch(() => listTableOfficials(), []);

  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function grant() {
    const uid = userId.trim();
    if (!uid) {
      setErr(t('Renseigne l’identifiant du compte.'));
      return;
    }
    setErr(null);
    setFlash(null);
    setBusy(true);
    try {
      await setUserRole(uid, 'table_technique');
      setUserId('');
      setFlash(t('Rôle accordé.'));
      await officials.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Attribution impossible.')));
    } finally {
      setBusy(false);
    }
  }

  function confirmRevoke(uid: string, name: string) {
    Alert.alert(t('Retirer le rôle ?'), t('{name} redeviendra un compte supporter.', { name }), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Retirer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await setUserRole(uid, 'fan');
            await officials.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Retrait impossible.')));
          }
        },
      },
    ]);
  }

  const rows = officials.data ?? [];

  return (
    <Screen refreshing={officials.loading} onRefresh={() => officials.reload()}>
      <Header
        title={t('Table technique')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg }}>
        <Card>
          <Text style={{ color: C.dim, fontSize: 12, lineHeight: 18 }}>
            {t(
              'Un officiel de table peut désigner les arbitres, gérer la feuille de match et programmer les rencontres. Il n’a pas accès aux licences, transferts ni contenus.',
            )}
          </Text>
          <Field
            label={t('Identifiant du compte (UUID)')}
            value={userId}
            onChangeText={setUserId}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoCapitalize="none"
          />
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
          <Button title={t('Accorder le rôle')} onPress={grant} loading={busy} icon="key-outline" />
        </Card>
      </View>

      <SectionTitle title={t('Officiels de table ({n})', { n: rows.length })} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {rows.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {officials.loading ? t('Chargement…') : t('Aucun officiel de table.')}
            </Text>
          </Card>
        ) : (
          rows.map((p) => (
            <Card key={p.id} style={{ paddingVertical: 10 }}>
              <Row style={{ gap: 12 }}>
                <Crest label={(p.full_name ?? '—').slice(0, 2).toUpperCase()} color={C.surface2} size={34} round />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }}>
                    {p.full_name ?? t('Compte sans nom')}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 11 }} numberOfLines={1}>
                    {p.id}
                  </Text>
                </View>
                <Pressable onPress={() => confirmRevoke(p.id, p.full_name ?? t('Ce compte'))} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={21} color={C.red} />
                </Pressable>
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
