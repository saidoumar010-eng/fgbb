import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { listTeams } from '@/lib/db';
import { createClubAccount, type CreatedClubAccount } from '@/lib/db-club-space';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Création d'un compte de club par la fédération (Phase D).
 *
 * L'admin saisit un e-mail et choisit un club ; l'edge function crée le compte
 * d'authentification (clé de service, jamais exposée au client) et le rattache
 * au club. Le mot de passe — fourni ou généré — est affiché une seule fois pour
 * être transmis au dirigeant, qui le changera ensuite.
 */
export default function AdminCreateClubAccount() {
  const { t } = useT();
  const teams = useFetch(() => listTeams(), []);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClubAccount | null>(null);

  async function submit() {
    if (!email.trim() || !teamId) {
      setErr(t('Renseigne un e-mail et choisis un club.'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await createClubAccount({
        email: email.trim(),
        full_name: fullName.trim(),
        team_id: teamId,
        password: password.trim() || undefined,
      });
      setCreated(res);
      setEmail('');
      setFullName('');
      setPassword('');
      setTeamId(null);
    } catch (e) {
      setErr(errorMessage(e, t('Création du compte impossible.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header
        title={t('Créer un compte club')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg }}>
        <Card>
          <Text style={{ color: C.dim, fontSize: 12, lineHeight: 18 }}>
            {t(
              'La fédération crée ici le compte d’un club et le rattache automatiquement. Le club pourra se connecter, gérer son effectif et publier. Transmets-lui les identifiants ci-dessous.',
            )}
          </Text>
          <Field
            label={t('E-mail du club')}
            value={email}
            onChangeText={setEmail}
            placeholder="club@example.gn"
            autoCapitalize="none"
          />
          <Field
            label={t('Nom du responsable (facultatif)')}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('Nom du dirigeant')}
          />
          <Field
            label={t('Mot de passe (laisser vide pour en générer un)')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('Généré automatiquement')}
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
          <Button title={t('Créer le compte')} onPress={submit} loading={busy} icon="person-add-outline" />
        </Card>
      </View>

      {created ? (
        <>
          <SectionTitle title={t('Compte créé')} />
          <View style={{ paddingHorizontal: S.lg }}>
            <Card style={{ borderColor: C.green, borderWidth: 1, gap: 10 }}>
              <Row style={{ gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={C.green} />
                <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>
                  {t('Note ces identifiants : le mot de passe ne sera plus affiché.')}
                </Text>
              </Row>
              <CredLine label={t('E-mail')} value={created.email} />
              <CredLine label={t('Mot de passe')} value={created.password} mono />
              <Text style={{ color: C.dim, fontSize: 11.5 }}>
                {t('Demande au club de changer ce mot de passe à la première connexion.')}
              </Text>
            </Card>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function CredLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: C.surface2,
        borderRadius: R.sm,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}>
      <Text style={{ color: C.dim, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', fontFamily: mono ? 'monospace' : undefined }} selectable>
        {value}
      </Text>
    </View>
  );
}
