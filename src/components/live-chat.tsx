import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Card, Crest, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  errorMessage,
  listChatMessages,
  reportChatMessage,
  sendChatMessage,
  useChatRealtime,
} from '@/lib/db-fan';
import { matchWhen } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { ChatMessage, Match } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const MAX_LENGTH = 300;

// Chat en direct d'un match. Les messages les plus récents sont en haut :
// le composant s'insère dans un écran déjà défilant, on évite ainsi une liste
// imbriquée qui volerait le geste de défilement.
export function LiveChat({ match }: { match: Match }) {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id;
  const open = match.status !== 'scheduled';

  const history = useFetch(
    () => (open ? listChatMessages(match.id) : Promise.resolve([] as ChatMessage[])),
    [match.id, open],
  );
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Les messages reçus par le canal temps réel sont gardés à part : la requête
  // initiale peut se terminer après eux, ils seraient sinon perdus.
  const onInsert = useCallback((m: ChatMessage) => {
    setLive((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
  }, []);
  useChatRealtime(open ? match.id : undefined, onInsert);

  const messages = useMemo(() => {
    const fromLive = new Set(live.map((m) => m.id));
    return [...live, ...(history.data ?? []).filter((m) => !fromLive.has(m.id))].filter(
      (m) => m.status === 'visible',
    );
  }, [live, history.data]);

  async function send() {
    const text = body.trim();
    if (!text || !uid || sending) return;
    setSending(true);
    setErr(null);
    setFlash(null);
    try {
      await sendChatMessage(match.id, uid, text);
      setBody('');
      // Filet de sécurité si le canal temps réel n'a pas encore répondu.
      await history.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Impossible d’envoyer le message.')));
    } finally {
      setSending(false);
    }
  }

  function report(m: ChatMessage) {
    if (!uid) {
      router.push('/login');
      return;
    }
    Alert.alert(t('Signaler ce message'), t('La fédération examinera ce message.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Signaler'),
        style: 'destructive',
        onPress: async () => {
          try {
            await reportChatMessage(m.id, uid);
            setErr(null);
            setFlash(t('Message signalé à la fédération. Merci.'));
          } catch (e) {
            setErr(errorMessage(e, t('Le signalement n’a pas abouti.')));
          }
        },
      },
    ]);
  }

  if (!open) {
    return (
      <Card>
        <Row style={{ gap: 8 }}>
          <Ionicons name="chatbubbles-outline" size={18} color={C.dim} />
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>
            {t('Le chat ouvre au coup d’envoi')}
          </Text>
        </Row>
        <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
          {t('Reviens dès le début du match pour encourager ton équipe avec les autres supporters.')}
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Ionicons name="chatbubbles" size={16} color={C.accent} />
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{t('Chat en direct')}</Text>
        </Row>
        <Text style={{ color: C.dim, fontSize: 11 }}>{t('Les plus récents en haut')}</Text>
      </Row>

      {session ? (
        <View style={{ marginTop: S.md }}>
          <Row style={{ gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t('Ton message…')}
              placeholderTextColor={C.dim}
              maxLength={MAX_LENGTH}
              multiline
              style={{
                flex: 1,
                backgroundColor: C.inputBg,
                borderWidth: 1,
                borderColor: C.borderStrong,
                borderRadius: R.sm,
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 44,
                maxHeight: 110,
                color: C.text,
                fontSize: 14,
              }}
            />
            <Pressable
              onPress={send}
              disabled={sending || !body.trim()}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 44,
                  borderRadius: R.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: body.trim() ? C.accent : C.surface2,
                },
                pressed && { opacity: 0.85 },
              ]}>
              {sending ? (
                <ActivityIndicator color={C.accentText} />
              ) : (
                <Ionicons name="send" size={17} color={body.trim() ? C.accentText : C.dim} />
              )}
            </Pressable>
          </Row>
          {body.length > MAX_LENGTH - 60 && (
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 5, textAlign: 'right' }}>
              {t('{n} caractères restants', { n: MAX_LENGTH - body.length })}
            </Text>
          )}
        </View>
      ) : (
        <Pressable onPress={() => router.push('/login')} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <View
            style={{
              marginTop: S.md,
              borderRadius: R.md,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.surface2,
              padding: 12,
              gap: 4,
            }}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>
              {t('Connecte-toi pour participer au chat')}
            </Text>
            <Text style={{ color: C.dim, fontSize: 12 }}>
              {t('Tu peux lire les messages sans compte.')}
            </Text>
          </View>
        </Pressable>
      )}

      {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
      {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}

      <View style={{ marginTop: S.md, gap: 10 }}>
        {messages.length === 0 ? (
          <Text style={{ color: C.dim, fontSize: 12.5, textAlign: 'center', paddingVertical: 14 }}>
            {history.loading ? t('Chargement…') : t('Aucun message pour l’instant. Lance la discussion !')}
          </Text>
        ) : (
          messages.map((m) => (
            <MessageRow key={m.id} message={m} mine={m.user_id === uid} onReport={() => report(m)} />
          ))
        )}
      </View>
    </Card>
  );
}

function MessageRow({
  message,
  mine,
  onReport,
}: {
  message: ChatMessage;
  mine: boolean;
  onReport: () => void;
}) {
  const { t } = useT();
  return (
    <Row style={{ gap: 10, alignItems: 'flex-start' }}>
      <Crest
        label={message.author_name.slice(0, 2).toUpperCase()}
        color={mine ? C.teal : C.surface2}
        size={30}
        round
      />
      <View
        style={{
          flex: 1,
          borderRadius: R.md,
          borderWidth: 1,
          borderColor: mine ? 'rgba(59,214,27,0.35)' : C.border,
          backgroundColor: mine ? C.accentSoft : C.surface2,
          paddingHorizontal: 11,
          paddingVertical: 9,
        }}>
        <Row style={{ justifyContent: 'space-between', gap: 8 }}>
          <Text
            style={{ color: mine ? C.accent : C.muted, fontSize: 11.5, fontWeight: '600', flex: 1 }}
            numberOfLines={1}>
            {mine ? t('Toi') : message.author_name}
          </Text>
          <Text style={{ color: C.dim, fontSize: 11 }}>{matchWhen(message.created_at).time}</Text>
          {!mine && (
            <Pressable onPress={onReport} hitSlop={8} accessibilityLabel={t('Signaler ce message')}>
              <Ionicons name="flag-outline" size={13} color={C.dim} />
            </Pressable>
          )}
        </Row>
        <Text style={{ color: C.text, fontSize: 13.5, marginTop: 3, lineHeight: 19 }}>{message.body}</Text>
      </View>
    </Row>
  );
}
