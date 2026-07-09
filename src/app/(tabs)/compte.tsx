import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { Button, Card, Crest, Header, Logo, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listFavoriteTeams } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { registerForPush, unregisterPush } from '@/lib/notifications';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function CompteScreen() {
  const { session, profile, isAdmin, signOut } = useAuth();
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
        Alert.alert('Notifications', res.error ?? 'Activation impossible.');
      }
    } else {
      await unregisterPush(session.user.id);
    }
  }

  if (!session) {
    return (
      <Screen>
        <Header title="Mon compte" />
        <View style={{ alignItems: 'center', paddingHorizontal: S.xl, paddingTop: S.xl, gap: S.md }}>
          <Logo size={84} />
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
            Connecte-toi
          </Text>
          <Text style={{ color: C.dim, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            Suis tes équipes favorites, reçois les notifications et accède à l'espace fédération.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button title="Connexion / inscription" icon="log-in-outline" onPress={() => router.push('/login')} />
          </View>
        </View>
      </Screen>
    );
  }

  const name = profile?.full_name || session.user.email || 'Utilisateur';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <Screen>
      <Header title="Mon compte" />
      <View style={{ padding: S.lg }}>
        <Card>
          <Row style={{ gap: 13 }}>
            <Crest label={initials} color={C.surface2} size={50} round />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
              <Text style={{ color: C.dim, fontSize: 12 }}>
                {isAdmin ? 'Administrateur · Fédération' : 'Supporter'}
              </Text>
            </View>
          </Row>
        </Card>
      </View>

      <SectionTitle title="Mes équipes favorites" />
      <View style={{ paddingHorizontal: S.lg }}>
        {favorites.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13, lineHeight: 19 }}>
              Aucune équipe favorite pour le moment. Ouvre la page d’un club et touche l’étoile ⭐ pour le suivre.
            </Text>
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {favorites.map((t) => (
              <Pressable key={t.id} onPress={() => router.push(`/team/${t.id}`)} style={{ width: '31.5%' }}>
                <Card style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Crest label={teamShort(t)} color={t.color ?? C.surface2} size={34} />
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 6 }} numberOfLines={1}>
                    {t.short_name ?? t.name}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <SectionTitle title="Notifications" />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          <SettingRow icon="notifications-outline" label="Notifications de match" value={notif} onChange={onToggleNotif} />
          <SettingRow icon="play-outline" label="Alerte résumé vidéo" value={video} onChange={setVideo} last />
        </Card>
      </View>

      <SectionTitle title="Administration" />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4 }}>
          {isAdmin ? (
            <Pressable onPress={() => router.push('/admin')}>
              <Row style={{ paddingVertical: 13, gap: 13 }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={C.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>Espace fédération</Text>
                  <Text style={{ color: C.dim, fontSize: 12 }}>Gérer joueurs, équipes, matchs, stats</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.dim} />
              </Row>
            </Pressable>
          ) : (
            <Row style={{ paddingVertical: 13, gap: 13 }}>
              <Ionicons name="lock-closed-outline" size={20} color={C.dim} />
              <Text style={{ color: C.dim, fontSize: 13, flex: 1 }}>
                Accès réservé aux comptes administrateurs de la fédération.
              </Text>
            </Row>
          )}
        </Card>
      </View>

      <View style={{ padding: S.lg }}>
        <Button title="Se déconnecter" tone="alt" icon="log-out-outline" onPress={signOut} />
      </View>
    </Screen>
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
        trackColor={{ false: '#2A3140', true: C.green }}
        thumbColor="#fff"
      />
    </Row>
  );
}
