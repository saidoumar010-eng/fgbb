import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyAttempts, listQuizzes } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Les quiz publiés par la fédération. Un quiz déjà joué garde son meilleur score.
export default function QuizListScreen() {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id;
  const quizzes = useFetch(() => listQuizzes());
  const attempts = useFetch(() => (uid ? listMyAttempts(uid) : Promise.resolve([])), [uid]);
  const [refreshing, setRefreshing] = useState(false);

  const list = (quizzes.data ?? []).filter((q) => q.is_active);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([quizzes.reload(), attempts.reload()]);
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Quiz')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => router.push('/classement-supporters')}>
            <Ionicons name="trophy-outline" size={20} color={C.accent} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Card style={{ backgroundColor: C.teal, borderColor: 'transparent' }}>
          <Row style={{ gap: 8 }}>
            <Ionicons name="basketball-outline" size={18} color={C.text} />
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
              {t('Teste tes connaissances')}
            </Text>
          </Row>
          <Text style={{ color: C.text, fontSize: 12.5, marginTop: 6, lineHeight: 18, opacity: 0.9 }}>
            {t('Chaque bonne réponse rapporte 1 point au classement des supporters.')}
          </Text>
        </Card>

        {!session && (
          <Pressable onPress={() => router.push('/login')} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
            <Card style={{ borderColor: 'rgba(59,214,27,0.35)' }}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>
                {t('Connecte-toi pour jouer')}
              </Text>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                {t('Ton score est enregistré et compte pour le classement.')}
              </Text>
            </Card>
          </Pressable>
        )}

        {list.length === 0 ? (
          <Empty
            icon="help-circle-outline"
            title={quizzes.loading ? t('Chargement…') : t('Aucun quiz en cours')}
            subtitle={quizzes.loading ? undefined : t('Les quiz de la fédération apparaîtront ici. Reviens bientôt !')}
          />
        ) : (
          list.map((q) => {
            const attempt = (attempts.data ?? []).find((a) => a.quiz_id === q.id) ?? null;
            return (
              <Pressable
                key={q.id}
                onPress={() => router.push(`/quiz/${q.id}`)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                <Card>
                  <Row style={{ gap: 12 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: R.md,
                        backgroundColor: C.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Ionicons name="help-circle-outline" size={21} color={C.accent} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }}>{q.title}</Text>
                      {q.description ? (
                        <Text style={{ color: C.dim, fontSize: 12.5 }} numberOfLines={2}>
                          {q.description}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.dim} />
                  </Row>
                  <Row style={{ gap: 8, marginTop: 10 }}>
                    {attempt ? (
                      <Pill
                        label={t('Ton score : {score}/{total}', { score: attempt.score, total: attempt.total })}
                        tone="green"
                      />
                    ) : (
                      <Pill label={t('Pas encore joué')} tone="accent" />
                    )}
                    {attempt ? <Pill label={t('Rejouer pour améliorer ton score')} tone="neutral" /> : null}
                  </Row>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>
    </Screen>
  );
}
