import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Card, Row, st } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  COMMENT_MAX,
  addComment,
  deleteComment,
  listComments,
  reportContent,
  timeAgo,
} from '@/lib/db-community';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Comment, CommentTarget } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const REASONS = ['Insultes', 'Spam', 'Hors sujet', 'Autre'];

/** Fil de commentaires des supporters, monté sur une page match ou un article. */
export function Comments({ targetType, targetId }: { targetType: CommentTarget; targetId: string }) {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const list = useFetch(() => listComments(targetType, targetId), [targetType, targetId]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Comment | null>(null);

  const comments = list.data ?? [];
  const left = COMMENT_MAX - body.length;
  const text = body.trim();

  async function send() {
    if (!uid || !text || sending) return;
    setSending(true);
    setErr(null);
    setFlash(null);
    try {
      await addComment(targetType, targetId, uid, text);
      setBody('');
      await list.reload();
    } catch (e) {
      // Refus du trigger SQL (compte suspendu, langage, anti-spam) : le message
      // Postgres est déjà explicite et en français, on l'affiche tel quel.
      setErr(e instanceof Error ? e.message : t('Erreur'));
    } finally {
      setSending(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(t('Supprimer le commentaire'), t('Cette action est définitive.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          setErr(null);
          try {
            await deleteComment(id);
            await list.reload();
          } catch (e) {
            setErr(e instanceof Error ? e.message : t('Erreur'));
          }
        },
      },
    ]);
  }

  async function report(reason: string) {
    const target = reporting;
    setReporting(null);
    if (!target || !uid) return;
    setErr(null);
    try {
      const created = await reportContent('comment', target.id, uid, reason);
      setFlash(created ? t('Merci, la fédération va examiner ce message.') : t('Tu as déjà signalé ce message.'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Erreur'));
    }
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Row style={{ gap: 7 }}>
          <Ionicons name="chatbubbles-outline" size={15} color={C.accent} />
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Commentaires')}</Text>
        </Row>
        {comments.length > 0 && (
          <Text style={{ color: C.dim, fontSize: 11 }}>{t('{n} message(s)', { n: comments.length })}</Text>
        )}
      </Row>

      {uid ? (
        <View>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('Partage ton avis…')}
            placeholderTextColor={C.dim}
            multiline
            maxLength={COMMENT_MAX}
            style={[st.input, { minHeight: 78, paddingTop: 10, textAlignVertical: 'top' }]}
          />
          <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ color: left < 50 ? C.red : C.dim, fontSize: 11 }}>
              {t('{n} caractères restants', { n: left })}
            </Text>
            <Pressable
              onPress={send}
              disabled={!text || sending}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: R.pill,
                  backgroundColor: C.accent,
                  opacity: !text || sending ? 0.5 : 1,
                },
                pressed && { opacity: 0.8 },
              ]}>
              {sending ? (
                <ActivityIndicator size="small" color={C.accentText} />
              ) : (
                <Ionicons name="send" size={14} color={C.accentText} />
              )}
              <Text style={{ color: C.accentText, fontSize: 12.5, fontWeight: '600' }}>{t('Envoyer')}</Text>
            </Pressable>
          </Row>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push('/login')}
          style={({ pressed }) => [
            {
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: R.md,
              backgroundColor: C.surface2,
              padding: S.md,
              alignItems: 'center',
              gap: 8,
            },
            pressed && { opacity: 0.85 },
          ]}>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('Connecte-toi pour commenter')}</Text>
          <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{t('Se connecter')}</Text>
        </Pressable>
      )}

      {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
      {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
      {list.error ? (
        <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{t('Impossible de charger les commentaires.')}</Text>
      ) : null}

      {list.loading && comments.length === 0 ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 18 }} />
      ) : comments.length === 0 && !list.error ? (
        <Text style={{ color: C.dim, fontSize: 12.5, textAlign: 'center', marginTop: 18 }}>
          {t('Sois le premier à réagir')}
        </Text>
      ) : (
        <View style={{ marginTop: 6 }}>
          {comments.map((c) => {
            const mine = c.user_id === uid;
            return (
              <View key={c.id} style={{ paddingTop: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: C.border }}>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: mine ? C.accent : C.text, fontSize: 12.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {mine ? t('Moi') : c.author_name}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 11 }}>{timeAgo(c.created_at, t)}</Text>
                  {mine ? (
                    <Pressable onPress={() => confirmDelete(c.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={15} color={C.dim} />
                    </Pressable>
                  ) : uid ? (
                    <Pressable onPress={() => setReporting(c)} hitSlop={8}>
                      <Ionicons name="flag-outline" size={15} color={C.dim} />
                    </Pressable>
                  ) : null}
                </Row>
                {c.status === 'hidden' && (
                  <Text style={{ color: C.red, fontSize: 11, marginTop: 3 }}>
                    {t('Masqué par la modération')}
                  </Text>
                )}
                <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>{c.body}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={!!reporting} transparent animationType="fade" onRequestClose={() => setReporting(null)}>
        <Pressable
          onPress={() => setReporting(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          {/* onPress vide : sans lui, le panneau ne capte pas le toucher et le fond le referme. */}
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: C.surface,
              borderTopLeftRadius: R.xl,
              borderTopRightRadius: R.xl,
              padding: S.lg,
              gap: 4,
            }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Signaler ce message')}</Text>
            <Text style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{t('Choisis un motif :')}</Text>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => report(r)}
                style={({ pressed }) => [
                  {
                    paddingVertical: 13,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={{ color: C.text, fontSize: 14 }}>{t(r)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setReporting(null)} style={{ paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontSize: 14 }}>{t('Annuler')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
