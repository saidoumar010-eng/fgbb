import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Share, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, getQuiz, listQuizQuestionsPublic, submitQuiz } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { PublicQuizQuestion, QuizResult } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Déroulé du quiz : une question à la fois, puis la correction renvoyée par le
// serveur. Les bonnes réponses n'existent nulle part avant l'envoi.
export default function QuizPlayScreen() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const quiz = useFetch(() => getQuiz(id), [id]);
  const questions = useFetch(() => listQuizQuestionsPublic(id), [id]);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = questions.data ?? [];
  const current = list[step];
  const answered = Object.keys(answers).length;

  async function send() {
    if (sending) return;
    setSending(true);
    setErr(null);
    try {
      setResult(await submitQuiz(id, answers));
    } catch (e) {
      setErr(errorMessage(e, t('Le quiz n’a pas pu être envoyé.')));
    } finally {
      setSending(false);
    }
  }

  function restart() {
    setAnswers({});
    setResult(null);
    setStep(0);
    setErr(null);
  }

  const back = (
    <Pressable onPress={() => router.back()}>
      <Ionicons name="chevron-back" size={24} color={C.muted} />
    </Pressable>
  );

  if (quiz.error || (!quiz.loading && !quiz.data)) {
    return (
      <Screen>
        <Header title={t('Quiz')} left={back} />
        <Empty icon="help-circle-outline" title={t('Quiz introuvable')} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <Header title={quiz.data?.title ?? t('Quiz')} left={back} />
        <View style={{ padding: S.lg }}>
          <Card>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{t('Connexion requise')}</Text>
            <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              {t('La correction se fait sur le serveur : connecte-toi pour jouer et gagner des points.')}
            </Text>
            <Button title={t('Se connecter')} onPress={() => router.push('/login')} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (result) {
    return (
      <QuizResultView
        title={quiz.data?.title ?? ''}
        questions={list}
        result={result}
        onRestart={restart}
        back={back}
      />
    );
  }

  if (list.length === 0) {
    return (
      <Screen>
        <Header title={quiz.data?.title ?? t('Quiz')} left={back} />
        <Empty
          icon="help-circle-outline"
          title={questions.loading ? t('Chargement…') : t('Aucune question')}
          subtitle={questions.loading ? undefined : t('Ce quiz n’a pas encore de question.')}
        />
      </Screen>
    );
  }

  const last = step === list.length - 1;
  const pickedHere = current ? answers[current.id] : undefined;

  return (
    <Screen>
      <Header title={quiz.data?.title ?? t('Quiz')} left={back} />

      <View style={{ padding: S.lg, gap: 14 }}>
        <View style={{ gap: 7 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>
              {t('Question {n} sur {total}', { n: step + 1, total: list.length })}
            </Text>
            <Text style={{ color: C.dim, fontSize: 12 }}>
              {t('{n} répondues', { n: answered })}
            </Text>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.round((100 * (step + 1)) / list.length)}%`,
                height: '100%',
                backgroundColor: C.accent,
              }}
            />
          </View>
        </View>

        <Card>
          <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '600', lineHeight: 22 }}>
            {current.question}
          </Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {current.options.map((opt, i) => {
              const on = pickedHere === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setAnswers((prev) => ({ ...prev, [current.id]: i }))}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderRadius: R.md,
                      borderWidth: 1,
                      borderColor: on ? C.accent : C.border,
                      backgroundColor: on ? C.accentSoft : C.surface2,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                    },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={17}
                    color={on ? C.accent : C.dim}
                  />
                  <Text style={{ color: on ? C.accent : C.text, fontSize: 13.5, flex: 1 }}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {err ? <Text style={{ color: C.red, fontSize: 12.5 }}>{err}</Text> : null}

        <Row style={{ gap: 10 }}>
          {step > 0 && (
            <View style={{ flex: 1 }}>
              <Button title={t('Précédent')} tone="alt" onPress={() => setStep((s) => s - 1)} />
            </View>
          )}
          <View style={{ flex: 2 }}>
            <Button
              title={last ? t('Voir mon score') : t('Suivant')}
              loading={sending}
              disabled={pickedHere === undefined}
              onPress={() => (last ? send() : setStep((s) => s + 1))}
            />
          </View>
        </Row>

        {!last && pickedHere === undefined && (
          <Pressable onPress={() => setStep((s) => s + 1)} style={{ alignSelf: 'center' }}>
            <Text style={{ color: C.dim, fontSize: 12.5 }}>{t('Passer cette question')}</Text>
          </Pressable>
        )}
        {last && pickedHere === undefined && (
          <Pressable onPress={send} style={{ alignSelf: 'center' }}>
            <Text style={{ color: C.dim, fontSize: 12.5 }}>{t('Envoyer sans répondre')}</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function QuizResultView({
  title,
  questions,
  result,
  onRestart,
  back,
}: {
  title: string;
  questions: PublicQuizQuestion[];
  result: QuizResult;
  onRestart: () => void;
  back: ReactNode;
}) {
  const { t } = useT();
  const pct = result.total > 0 ? Math.round((100 * result.score) / result.total) : 0;

  async function share() {
    await Share.share({
      message: t('J’ai obtenu {score}/{total} au quiz « {title} » de la FGBB. À toi de jouer !', {
        score: result.score,
        total: result.total,
        title,
      }),
    }).catch(() => {});
  }

  return (
    <Screen>
      <Header title={t('Résultat')} left={back} />

      <View style={{ padding: S.lg, gap: 14 }}>
        <Card style={{ alignItems: 'center', paddingVertical: S.xl, gap: 6 }}>
          <Text style={{ color: C.dim, fontSize: 12.5 }}>{title}</Text>
          <Text style={{ color: C.accent, fontSize: 40, fontWeight: '700' }}>
            {result.score} / {result.total}
          </Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>
            {pct >= 80
              ? t('Excellent, tu connais ton basket !')
              : pct >= 50
                ? t('Pas mal ! Encore un effort.')
                : t('Il va falloir réviser…')}
          </Text>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {t('{n} points ajoutés à ton total de supporter', { n: result.score })}
          </Text>
          <Row style={{ gap: 10, marginTop: S.md }}>
            <Pressable onPress={share}>
              <Row
                style={{
                  gap: 7,
                  backgroundColor: C.accent,
                  borderRadius: R.md,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                }}>
                <Ionicons name="share-social-outline" size={17} color={C.accentText} />
                <Text style={{ color: C.accentText, fontSize: 14, fontWeight: '600' }}>
                  {t('Partager mon score')}
                </Text>
              </Row>
            </Pressable>
          </Row>
        </Card>

        <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>{t('La correction')}</Text>

        {questions.map((q, qi) => {
          const corr = result.corrections.find((c) => c.question_id === q.id);
          const good = corr ? corr.chosen === corr.correct_index : false;
          return (
            <Card key={q.id}>
              <Row style={{ gap: 8, alignItems: 'flex-start' }}>
                <Ionicons
                  name={good ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={good ? C.green : C.red}
                />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 }}>
                  {qi + 1}. {q.question}
                </Text>
              </Row>
              <View style={{ gap: 7, marginTop: 10 }}>
                {q.options.map((opt, i) => {
                  const isCorrect = corr?.correct_index === i;
                  const isWrongPick = corr?.chosen === i && !isCorrect;
                  const border = isCorrect ? C.green : isWrongPick ? C.red : C.border;
                  const bg = isCorrect ? C.greenSoft : isWrongPick ? C.redSoft : C.surface2;
                  const fg = isCorrect ? C.green : isWrongPick ? C.red : C.muted;
                  return (
                    <Row
                      key={i}
                      style={{
                        gap: 9,
                        borderRadius: R.sm,
                        borderWidth: 1,
                        borderColor: border,
                        backgroundColor: bg,
                        paddingHorizontal: 11,
                        paddingVertical: 9,
                      }}>
                      {isCorrect || isWrongPick ? (
                        <Ionicons name={isCorrect ? 'checkmark' : 'close'} size={14} color={fg} />
                      ) : (
                        <View style={{ width: 14 }} />
                      )}
                      <Text style={{ color: fg, fontSize: 13, flex: 1 }}>{opt}</Text>
                    </Row>
                  );
                })}
              </View>
              {corr && corr.chosen === null ? (
                <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 8 }}>{t('Sans réponse')}</Text>
              ) : null}
            </Card>
          );
        })}

        <Button title={t('Rejouer')} tone="alt" icon="refresh-outline" onPress={onRestart} />
        <Button
          title={t('Voir le classement des supporters')}
          icon="trophy-outline"
          onPress={() => router.push('/classement-supporters')}
        />
      </View>
    </Screen>
  );
}
