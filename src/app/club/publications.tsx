import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ClubPostCard } from '@/components/club-post-card';
import { ImageField } from '@/components/image-field';
import { Button, Card, Empty, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getTeam, listTeamPosts } from '@/lib/db';
import { createClubPost, deleteClubPost, getClubAudience } from '@/lib/db-club-space';
import { errorMessage } from '@/lib/db-fan';
import { notifySubscribers } from '@/lib/notifications';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { ClubPost } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/**
 * Publications du club, côté dirigeant : audience, rédaction d'un message
 * (photo optionnelle) qui notifie les abonnés, et gestion de ses publications.
 */
export default function ClubPublicationsScreen() {
  const { t } = useT();
  const { session } = useAuth();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const uid = session?.user.id ?? null;

  const teamQ = useFetch(() => (team ? getTeam(team) : Promise.resolve(null)), [team]);
  const postsQ = useFetch(() => (team ? listTeamPosts(team) : Promise.resolve([] as ClubPost[])), [team]);
  const audienceQ = useFetch(() => (team ? getClubAudience(team) : Promise.resolve(null)), [team]);

  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const posts = postsQ.data ?? [];
  const audience = audienceQ.data;

  async function publish() {
    if (!team || !body.trim()) {
      setErr(t('Écris un message avant de publier.'));
      return;
    }
    setBusy(true);
    setErr(null);
    setFlash(null);
    try {
      await createClubPost({ team_id: team, author_id: uid, body, image_url: image });
      // Best-effort : prévient les abonnés du club (jamais bloquant).
      const clubName = teamQ.data?.name;
      await notifySubscribers({
        title: clubName ? t('Nouvelle publication de {club}', { club: clubName }) : t('Nouvelle publication'),
        body: body.trim().slice(0, 120),
        team_ids: [team],
      });
      setBody('');
      setImage(null);
      setFlash(t('Publication envoyée.'));
      await Promise.all([postsQ.reload(), audienceQ.reload()]);
    } catch (e) {
      setErr(errorMessage(e, t('Publication impossible.')));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(post: ClubPost) {
    Alert.alert(t('Supprimer cette publication ?'), t('Cette action est définitive.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClubPost(post.id);
            await Promise.all([postsQ.reload(), audienceQ.reload()]);
          } catch (e) {
            setErr(errorMessage(e, t('Suppression impossible.')));
          }
        },
      },
    ]);
  }

  const header = (
    <Header
      title={t('Publications')}
      left={
        <Pressable onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (!session || !team) {
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

  return (
    <Screen refreshing={postsQ.loading} onRefresh={() => postsQ.reload()}>
      {header}

      <View style={{ padding: S.lg, gap: 12 }}>
        {/* Audience */}
        <Row style={{ gap: 9, alignItems: 'stretch' }}>
          <AudienceTile label={t('Abonnés')} value={audience ? `${audience.followers}` : '—'} icon="people-outline" />
          <AudienceTile label={t('Publications')} value={audience ? `${audience.posts}` : '—'} icon="megaphone-outline" />
        </Row>

        {/* Composeur */}
        <Card>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
            {t('Nouvelle publication')}
          </Text>
          <TextInput
            placeholder={t('Un message pour tes abonnés…')}
            placeholderTextColor={C.dim}
            value={body}
            onChangeText={setBody}
            multiline
            style={{
              backgroundColor: C.inputBg,
              borderWidth: 1,
              borderColor: C.borderStrong,
              borderRadius: R.sm,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: C.text,
              fontSize: 14,
              minHeight: 90,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ marginTop: 10 }}>
            <ImageField label={t('Photo (facultative)')} value={image} onChange={setImage} folder="posts" />
          </View>
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
          <Button title={t('Publier')} onPress={publish} loading={busy} icon="send-outline" />
        </Card>
      </View>

      <SectionTitle title={t('Mes publications ({n})', { n: posts.length })} />
      <View style={{ paddingHorizontal: S.lg, gap: 9, paddingBottom: S.lg }}>
        {posts.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {postsQ.loading ? t('Chargement…') : t('Aucune publication pour le moment.')}
            </Text>
          </Card>
        ) : (
          posts.map((p) => <ClubPostCard key={p.id} post={p} onDelete={() => confirmDelete(p)} />)
        )}
      </View>
    </Screen>
  );
}

function AudienceTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Card style={{ paddingVertical: 12, gap: 4 }}>
        <Row style={{ gap: 7 }}>
          <Ionicons name={icon} size={15} color={C.accent} />
          <Text style={{ color: C.dim, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
        </Row>
        <Text style={{ color: C.accent, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      </Card>
    </View>
  );
}
