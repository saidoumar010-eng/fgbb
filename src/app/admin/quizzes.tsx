import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { deleteQuiz, errorMessage, listQuizzes, setQuizActive } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Gestion des quiz de la fan zone (espace fédération).
export default function AdminQuizzes() {
  const { t } = useT();
  const quizzes = useFetch(() => listQuizzes());
  const [err, setErr] = useState<string | null>(null);
  const list = quizzes.data ?? [];

  async function toggle(id: string, isActive: boolean) {
    setErr(null);
    try {
      await setQuizActive(id, isActive);
      await quizzes.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Impossible de modifier ce quiz.')));
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(t('Supprimer le quiz'), t('Les questions et les scores associés seront supprimés.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteQuiz(id);
            await quizzes.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Impossible de supprimer ce quiz.')));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <Header
        title={t('Quiz')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Button title={t('Créer un quiz')} icon="add" onPress={() => router.push('/admin/quiz-form')} />

        {err ? <Text style={{ color: C.red, fontSize: 12.5 }}>{err}</Text> : null}

        {list.length === 0 ? (
          <Empty icon="help-circle-outline" title={quizzes.loading ? t('Chargement…') : t('Aucun quiz')} />
        ) : (
          list.map((q) => (
            <Card key={q.id}>
              <Pressable onPress={() => router.push(`/admin/quiz-form?id=${q.id}`)}>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{q.title}</Text>
                  <Pill
                    label={q.is_active ? t('Publié') : t('Brouillon')}
                    tone={q.is_active ? 'green' : 'neutral'}
                  />
                </Row>
                {q.description ? (
                  <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }} numberOfLines={2}>
                    {q.description}
                  </Text>
                ) : null}
              </Pressable>
              <Row style={{ gap: 18, marginTop: 12 }}>
                <Pressable onPress={() => router.push(`/admin/quiz-form?id=${q.id}`)}>
                  <Text style={{ color: C.accent, fontSize: 12.5 }}>{t('Modifier')}</Text>
                </Pressable>
                <Pressable onPress={() => toggle(q.id, !q.is_active)}>
                  <Text style={{ color: C.accent, fontSize: 12.5 }}>
                    {q.is_active ? t('Dépublier') : t('Publier')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(q.id)}>
                  <Text style={{ color: C.red, fontSize: 12.5 }}>{t('Supprimer')}</Text>
                </Pressable>
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
