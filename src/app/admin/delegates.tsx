import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Crest, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import {
  addClubDelegate,
  listClubDelegates,
  removeClubDelegate,
} from '@/lib/db-club-space';
import { listTeams } from '@/lib/db';
import { errorMessage } from '@/lib/db-fan';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Délégations de club, côté fédération.
 *
 * Rattacher un compte à un club lui ouvre la gestion de l'effectif de ce club.
 * L'opération est réservée aux administrateurs, et la base le fait respecter :
 * un dirigeant ne peut pas s'accorder un second club (migration 0019).
 */
export default function AdminDelegates() {
  const { t } = useT();
  const delegates = useFetch(() => listClubDelegates(), []);
  const teams = useFetch(() => listTeams(), []);

  const [userId, setUserId] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function grant() {
    const uid = userId.trim();
    if (!uid || !teamId) {
      setErr(t('Renseigne l’identifiant du compte et choisis un club.'));
      return;
    }
    setErr(null);
    setFlash(null);
    setBusy(true);
    try {
      await addClubDelegate(uid, teamId);
      setUserId('');
      setFlash(t('Délégation accordée.'));
      await delegates.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Délégation impossible.')));
    } finally {
      setBusy(false);
    }
  }

  function confirmRevoke(uid: string, tid: string, clubName: string) {
    Alert.alert(t('Retirer la délégation ?'), t('Ce compte ne pourra plus gérer {club}.', { club: clubName }), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Retirer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeClubDelegate(uid, tid);
            await delegates.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Retrait impossible.')));
          }
        },
      },
    ]);
  }

  const rows = delegates.data ?? [];

  return (
    <Screen refreshing={delegates.loading} onRefresh={() => delegates.reload()}>
      <Header
        title={t('Délégations de club')}
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
              'Un compte rattaché à un club peut gérer l’effectif de ce club et sa présentation. Il ne peut ni créer de match, ni saisir de score, ni délivrer de licence.',
            )}
          </Text>
          {/* L'identifiant se lit dans Supabase (Authentication > Users) : on ne
              cherche pas les comptes par e-mail depuis l'app, la table auth
              n'est pas exposée au client. */}
          <Field
            label={t('Identifiant du compte (UUID)')}
            value={userId}
            onChangeText={setUserId}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoCapitalize="none"
          />
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>{t('Club')}</Text>
          <ChipSelect
            options={(teams.data ?? []).map((tm) => ({ id: tm.id, label: tm.name }))}
            value={teamId}
            onChange={setTeamId}
            wrap
          />
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
          <Button title={t('Accorder la délégation')} onPress={grant} loading={busy} icon="key-outline" />
        </Card>
      </View>

      <SectionTitle title={t('Délégations en cours ({n})', { n: rows.length })} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {rows.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {delegates.loading ? t('Chargement…') : t('Aucune délégation accordée.')}
            </Text>
          </Card>
        ) : (
          rows.map((d) => (
            <Card key={`${d.user_id}-${d.team_id}`} style={{ paddingVertical: 10 }}>
              <Row style={{ gap: 12 }}>
                <Crest
                  label={teamShort(d.team)}
                  color={d.team?.color ?? C.surface2}
                  size={34}
                  image={d.team?.logo_url}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }}>
                    {d.team?.name ?? t('Club supprimé')}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 11 }} numberOfLines={1}>
                    {d.user_id}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmRevoke(d.user_id, d.team_id, d.team?.name ?? '')}
                  hitSlop={8}>
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
