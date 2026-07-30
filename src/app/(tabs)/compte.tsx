import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { Button, Card, Crest, Header, Logo, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listFavoriteTeams } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { useT, type Lang } from '@/lib/i18n';
import { registerForPush, unregisterPush } from '@/lib/notifications';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function CompteScreen() {
  const { session, profile, isAdmin, signOut } = useAuth();
  const { lang, setLang, t } = useT();
  const [notif, setNotif] = useState(true);
  const [video, setVideo] = useState(true);
  const favsQ = useFetch(() => listFavoriteTeams(), []);
  const favorites = favsQ.data ?? [];

  async function onToggleNotif(v: boolean) {
    setNotif(v);
    if (!session) return;
    if (v) {
      const res = await registerForPush(session.user.id);
      if (!res.ok) {
        setNotif(false);
        Alert.alert(t('Notifications'), res.error ?? t('Activation impossible.'));
      }
    } else {
      await unregisterPush(session.user.id);
    }
  }

  if (!session) {
    return (
      <Screen>
        <Header title={t('Mon compte')} />
        <View style={{ alignItems: 'center', paddingHorizontal: S.xl, paddingTop: S.xl, gap: S.md }}>
          <Logo size={84} />
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
            {t('Connecte-toi')}
          </Text>
          <Text style={{ color: C.dim, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            {t("Suis tes équipes favorites, reçois les notifications et accède à l'espace fédération.")}
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button title={t('Connexion / inscription')} icon="log-in-outline" onPress={() => router.push('/login')} />
          </View>
        </View>

        {/* Le choix de la langue doit rester accessible sans compte :
            un visiteur anglophone doit pouvoir basculer avant de s'inscrire. */}
        <SectionTitle title={t('Langue de l’application')} />
        <View style={{ paddingHorizontal: S.lg }}>
          <Card>
            <LangSwitch lang={lang} setLang={setLang} />
          </Card>
        </View>

        <View style={{ padding: S.lg }}>
          <Button
            title={t('À propos de la fédération')}
            tone="alt"
            icon="information-circle-outline"
            onPress={() => router.push('/apropos' as never)}
          />
        </View>
      </Screen>
    );
  }

  const name = profile?.full_name || session.user.email || t('Utilisateur');
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <Screen>
      <Header title={t('Mon compte')} />
      <View style={{ padding: S.lg }}>
        <Card>
          <Row style={{ gap: 13 }}>
            <Crest label={initials} color={C.surface2} size={50} round />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
              <Text style={{ color: C.dim, fontSize: 12 }}>
                {isAdmin ? t('Administrateur · Fédération') : t('Supporter')}
              </Text>
            </View>
          </Row>
        </Card>
      </View>

      <SectionTitle title={t('Mes équipes favorites')} />
      <View style={{ paddingHorizontal: S.lg }}>
        {favorites.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13, lineHeight: 19 }}>
              {t(
                'Aucune équipe favorite pour le moment. Ouvre la page d’un club et touche l’étoile ⭐ pour le suivre.',
              )}
            </Text>
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {favorites.map((fav) => (
              <Pressable key={fav.id} onPress={() => router.push(`/team/${fav.id}`)} style={{ width: '31.5%' }}>
                <Card style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Crest label={teamShort(fav)} color={fav.color ?? C.surface2} size={34} />
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 6 }} numberOfLines={1}>
                    {fav.short_name ?? fav.name}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <SectionTitle title={t('Ma participation')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          <LinkRow
            icon="podium-outline"
            title={t('Classement des supporters')}
            sub={t('Mes points, mon rang, mes pronostics')}
            href="/classement-supporters"
          />
          <LinkRow
            icon="help-circle-outline"
            title={t('Quiz basket')}
            sub={t('Teste tes connaissances')}
            href="/quiz"
          />
          <LinkRow
            icon="business-outline"
            title={t('Inscrire mon club')}
            sub={t('Demande d’engagement en compétition')}
            href="/inscription-club"
            last
          />
        </Card>
      </View>

      <SectionTitle title={t('Notifications')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          <SettingRow
            icon="notifications-outline"
            label={t('Notifications de match')}
            value={notif}
            onChange={onToggleNotif}
          />
          <SettingRow icon="play-outline" label={t('Alerte résumé vidéo')} value={video} onChange={setVideo} last />
        </Card>
      </View>

      <SectionTitle title={t('Langue de l’application')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card>
          <LangSwitch lang={lang} setLang={setLang} />
        </Card>
      </View>

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          <LinkRow
            icon="information-circle-outline"
            title={t('À propos de la fédération')}
            sub={t('Présentation, contacts, partenaires')}
            href="/apropos"
            last
          />
        </Card>
      </View>

      <SectionTitle title={t('Administration')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          {isAdmin ? (
            <Pressable onPress={() => router.push('/admin')}>
              <Row style={{ paddingVertical: 13, gap: 13 }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>{t('Espace fédération')}</Text>
                  <Text style={{ color: C.dim, fontSize: 12 }}>{t('Gérer joueurs, équipes, matchs, stats')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.dim} />
              </Row>
            </Pressable>
          ) : (
            <Row style={{ paddingVertical: 13, gap: 13 }}>
              <Ionicons name="lock-closed-outline" size={20} color={C.dim} />
              <Text style={{ color: C.dim, fontSize: 13, flex: 1 }}>
                {t('Accès réservé aux comptes administrateurs de la fédération.')}
              </Text>
            </Row>
          )}
        </Card>
      </View>

      <View style={{ padding: S.lg }}>
        <Button title={t('Se déconnecter')} tone="alt" icon="log-out-outline" onPress={signOut} />
      </View>
    </Screen>
  );
}

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <Row style={{ gap: 9 }}>
      {(['fr', 'en'] as const).map((l) => {
        const on = lang === l;
        return (
          <Pressable
            key={l}
            onPress={() => setLang(l)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 11,
              borderRadius: 10,
              backgroundColor: on ? C.accentSoft : 'transparent',
              borderWidth: 1,
              borderColor: on ? C.accent : C.border,
            }}>
            <Text style={{ color: on ? C.accent : C.muted, fontSize: 13.5, fontWeight: '600' }}>
              {l === 'fr' ? 'Français' : 'English'}
            </Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

function LinkRow({
  icon,
  title,
  sub,
  href,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  href: string;
  last?: boolean;
}) {
  return (
    <Pressable onPress={() => router.push(href as never)}>
      <Row
        style={{
          paddingVertical: 13,
          gap: 13,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: C.border,
        }}>
        <Ionicons name={icon} size={20} color={C.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{title}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.dim} />
      </Row>
    </Pressable>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onChange,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <Row
      style={{
        paddingVertical: 11,
        gap: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.border,
      }}>
      <Ionicons name={icon} size={20} color={C.muted} />
      <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.switchTrack, true: C.green }}
        thumbColor="#fff"
      />
    </Row>
  );
}
