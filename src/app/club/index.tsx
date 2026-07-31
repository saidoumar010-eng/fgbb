import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ImageField } from '@/components/image-field';
import { Button, Card, Crest, Empty, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getClubRoster, listMyClubs, removeClubPlayer, updateMyClub } from '@/lib/db-club-space';
import { errorMessage } from '@/lib/db-fan';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S, TEAM_COLORS } from '@/lib/theme';
import type { Player } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/**
 * Espace du dirigeant de club.
 *
 * Il tient son effectif et la présentation de son club. Ce qui engage la
 * compétition — calendrier, scores, licences, transferts — reste à la
 * fédération, et la base le fait respecter (migration 0019) : cet écran
 * n'affiche donc que ce qui est réellement permis, sans bouton trompeur.
 */
export default function ClubSpace() {
  const { session } = useAuth();
  const { t } = useT();
  const clubs = useFetch(() => (session ? listMyClubs() : Promise.resolve([])), [session?.user.id]);
  const club = clubs.data?.[0];
  const roster = useFetch(
    () => (club ? getClubRoster(club.id) : Promise.resolve([] as Player[])),
    [club?.id],
  );

  const [coach, setCoach] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Les champs suivent la fiche tant que le dirigeant n'a rien tapé : pas de
  // `useEffect` de synchronisation, dont le retard fait clignoter le formulaire.
  const vCoach = coach ?? club?.coach ?? '';
  const vCity = city ?? club?.city ?? '';
  const vColor = color ?? club?.color ?? TEAM_COLORS[0];
  const vLogo = logo ?? club?.logo_url ?? null;

  async function save() {
    if (!club) return;
    setErr(null);
    setFlash(null);
    setSaving(true);
    try {
      await updateMyClub({
        team_id: club.id,
        coach: vCoach.trim() || null,
        city: vCity.trim() || null,
        color: vColor,
        logo_url: vLogo,
      });
      setFlash(t('Fiche du club enregistrée.'));
      await clubs.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(p: Player) {
    Alert.alert(t('Retirer ce joueur ?'), t('{name} sera retiré de l’effectif.', { name: p.full_name }), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Retirer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeClubPlayer(p.id);
            await roster.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Suppression impossible.')));
          }
        },
      },
    ]);
  }

  const header = (
    <Header
      title={t('Mon club')}
      left={
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (!session) {
    return (
      <Screen>
        {header}
        <Empty
          icon="lock-closed-outline"
          title={t('Connexion requise')}
          subtitle={t('Connecte-toi avec le compte que la fédération a rattaché à ton club.')}
        />
      </Screen>
    );
  }

  if (!club) {
    return (
      <Screen>
        {header}
        <Empty
          icon="shield-outline"
          title={clubs.loading ? t('Chargement…') : t('Aucun club rattaché')}
          subtitle={t(
            'Seule la fédération peut rattacher un compte à un club. Contacte-la pour obtenir ta délégation.',
          )}
        />
      </Screen>
    );
  }

  const players = roster.data ?? [];

  return (
    <Screen refreshing={roster.loading} onRefresh={() => roster.reload()}>
      {header}

      <View style={{ padding: S.lg }}>
        <Card>
          <Row style={{ gap: 13 }}>
            <Crest label={teamShort(club)} color={club.color ?? C.surface2} size={50} image={club.logo_url} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{club.name}</Text>
              <Text style={{ color: C.dim, fontSize: 12 }}>
                {[club.division, club.city].filter(Boolean).join(' · ') || t('Club')}
              </Text>
            </View>
          </Row>
          {/* Dire ce qui n'est pas modifiable évite de chercher un bouton absent. */}
          <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 11, lineHeight: 17 }}>
            {t(
              'Le nom du club, sa division et son calendrier relèvent de la fédération. Tu gères ici ton effectif et la présentation du club.',
            )}
          </Text>
        </Card>
      </View>

      <SectionTitle
        title={t('Effectif ({n})', { n: players.length })}
        action={
          <Pressable onPress={() => router.push(`/club/joueur?team=${club.id}` as never)}>
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>{t('+ Ajouter')}</Text>
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {players.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {roster.loading ? t('Chargement…') : t('Aucun joueur. Ajoute ton premier joueur.')}
            </Text>
          </Card>
        ) : (
          players.map((p) => (
            <Card key={p.id} style={{ paddingVertical: 10 }}>
              <Row style={{ gap: 12 }}>
                <Crest
                  label={p.full_name.slice(0, 2).toUpperCase()}
                  color={club.color ?? C.surface2}
                  size={36}
                  round
                  image={p.photo_url}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                    {p.number != null ? `#${p.number} ` : ''}
                    {p.full_name}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 12 }}>{p.position ?? t('Poste non précisé')}</Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/club/joueur?team=${club.id}&id=${p.id}` as never)}
                  hitSlop={8}>
                  <Ionicons name="create-outline" size={19} color={C.muted} />
                </Pressable>
                <Pressable onPress={() => confirmRemove(p)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={19} color={C.red} />
                </Pressable>
              </Row>
            </Card>
          ))
        )}
      </View>

      <SectionTitle title={t('Présentation du club')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card>
          <ImageField label={t('Logo du club')} value={vLogo} onChange={setLogo} folder="teams" />
          <Field label={t('Entraîneur')} value={vCoach} onChangeText={setCoach} placeholder={t('Nom du coach')} />
          <Field label={t('Ville')} value={vCity} onChangeText={setCity} placeholder="Conakry" />

          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>
            {t('Couleur du club')}
          </Text>
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            {TEAM_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: c,
                  borderWidth: vColor === c ? 3 : 1,
                  borderColor: vColor === c ? C.accent : C.border,
                }}
              />
            ))}
          </Row>

          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 12 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 12 }}>{flash}</Text> : null}
          <Button title={t('Enregistrer')} onPress={save} loading={saving} icon="save-outline" />
        </Card>
      </View>
    </Screen>
  );
}
