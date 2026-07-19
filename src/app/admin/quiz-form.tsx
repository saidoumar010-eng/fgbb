import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { Button, Card, Field, Row } from '@/components/ui';
import {
  deleteQuiz,
  deleteQuizQuestion,
  errorMessage,
  getQuiz,
  listQuizQuestionsAdmin,
  upsertQuiz,
  upsertQuizQuestion,
} from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

const MAX_OPTIONS = 4;

// Question en cours d'édition. `key` reste stable même sans identifiant en base :
// sans elle, réordonner ou supprimer ferait perdre le focus du champ de saisie.
interface Draft {
  key: string;
  id?: string;
  question: string;
  options: string[];
  correct: number;
}

let draftSeq = 0;
function emptyDraft(): Draft {
  return { key: `d${++draftSeq}`, question: '', options: ['', ''], correct: 0 };
}

export default function QuizForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [quizId, setQuizId] = useState<string | undefined>(id);
  const editing = !!quizId;

  const existing = useFetch(async () => (id ? getQuiz(id) : null), [id]);
  const existingQuestions = useFetch(async () => (id ? listQuizQuestionsAdmin(id) : []), [id]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);
  const seededQuestions = useRef(false);

  useEffect(() => {
    const q = existing.data;
    if (q && !seeded.current) {
      setTitle(q.title);
      setDescription(q.description ?? '');
      setIsActive(q.is_active);
      seeded.current = true;
    }
  }, [existing.data]);

  useEffect(() => {
    const rows = existingQuestions.data;
    if (rows && rows.length > 0 && !seededQuestions.current) {
      setDrafts(
        rows.map((r) => ({
          key: `d${++draftSeq}`,
          id: r.id,
          question: r.question,
          options: r.options.length >= 2 ? r.options : [...r.options, '', ''].slice(0, 2),
          correct: r.correct_index,
        })),
      );
      seededQuestions.current = true;
    }
  }, [existingQuestions.data]);

  function patch(key: string, changes: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }

  function move(index: number, delta: number) {
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeDraft(d: Draft) {
    if (d.id) setRemoved((prev) => [...prev, d.id as string]);
    setDrafts((prev) => prev.filter((x) => x.key !== d.key));
  }

  async function save() {
    if (!title.trim()) {
      setError(t('Le titre du quiz est obligatoire.'));
      return;
    }
    if (drafts.length === 0) {
      setError(t('Ajoute au moins une question.'));
      return;
    }

    // Les options vides sont ignorées : on vérifie que la bonne réponse en
    // fait toujours partie une fois le nettoyage effectué.
    const prepared: { draft: Draft; options: string[]; correct: number }[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      if (!d.question.trim()) {
        setError(t('La question {n} n’a pas d’intitulé.', { n: i + 1 }));
        return;
      }
      const kept = d.options
        .map((o, index) => ({ text: o.trim(), index }))
        .filter((o) => o.text.length > 0);
      if (kept.length < 2) {
        setError(t('La question {n} doit avoir au moins deux options.', { n: i + 1 }));
        return;
      }
      const correct = kept.findIndex((o) => o.index === d.correct);
      if (correct < 0) {
        setError(t('Choisis la bonne réponse de la question {n} parmi les options remplies.', { n: i + 1 }));
        return;
      }
      prepared.push({ draft: d, options: kept.map((o) => o.text), correct });
    }

    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const quiz = await upsertQuiz({
        id: quizId,
        title: title.trim(),
        description: description.trim() || null,
        is_active: isActive,
      });
      setQuizId(quiz.id);

      for (const questionId of removed) await deleteQuizQuestion(questionId);
      setRemoved([]);

      const saved: Draft[] = [];
      for (let i = 0; i < prepared.length; i++) {
        const { draft, options, correct } = prepared[i];
        const row = await upsertQuizQuestion({
          id: draft.id,
          quiz_id: quiz.id,
          question: draft.question.trim(),
          options,
          correct_index: correct,
          position: i,
        });
        // On récupère l'identifiant des nouvelles questions : un second
        // enregistrement doit les mettre à jour, pas les dupliquer.
        saved.push({ ...draft, id: row.id, options, correct });
      }
      setDrafts(saved);
      setFlash(editing ? t('Quiz mis à jour.') : t('Quiz enregistré.'));
    } catch (e) {
      setError(errorMessage(e, t('Impossible d’enregistrer le quiz.')));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer le quiz'), t('Les questions et les scores associés seront supprimés.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!quizId) return;
          try {
            await deleteQuiz(quizId);
            router.back();
          } catch (e) {
            setError(errorMessage(e, t('Impossible de supprimer ce quiz.')));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier le quiz') : t('Nouveau quiz')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer le quiz')}>
      <Field
        label={t('Titre')}
        placeholder={t('Ex. Connais-tu la D1 guinéenne ?')}
        value={title}
        onChangeText={setTitle}
      />
      <Field
        label={t('Description')}
        placeholder={t('Une phrase pour présenter le quiz')}
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, paddingTop: 10 }}
      />

      <Row style={{ justifyContent: 'space-between', gap: 12, marginTop: S.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 13 }}>{t('Publier ce quiz')}</Text>
          <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>
            {t('Un quiz publié est visible par tous les supporters.')}
          </Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ false: C.surface2, true: C.accentSoft }}
          thumbColor={isActive ? C.accent : C.dim}
        />
      </Row>

      <FormLabel>{t('Questions')}</FormLabel>
      <View style={{ gap: 12 }}>
        {drafts.map((d, i) => (
          <QuestionCard
            key={d.key}
            draft={d}
            index={i}
            count={drafts.length}
            onPatch={(changes) => patch(d.key, changes)}
            onMove={(delta) => move(i, delta)}
            onRemove={() => removeDraft(d)}
          />
        ))}
      </View>

      <Pressable onPress={() => setDrafts((prev) => [...prev, emptyDraft()])} style={{ marginTop: 14 }}>
        <Row style={{ gap: 6 }}>
          <Ionicons name="add-circle-outline" size={18} color={C.accent} />
          <Text style={{ color: C.accent, fontSize: 13 }}>{t('Ajouter une question')}</Text>
        </Row>
      </Pressable>

      {editing ? (
        <Button title={t('Supprimer le quiz')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}

function QuestionCard({
  draft,
  index,
  count,
  onPatch,
  onMove,
  onRemove,
}: {
  draft: Draft;
  index: number;
  count: number;
  onPatch: (changes: Partial<Draft>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { t } = useT();

  function setOption(i: number, value: string) {
    onPatch({ options: draft.options.map((o, j) => (j === i ? value : o)) });
  }

  function removeOption(i: number) {
    const options = draft.options.filter((_, j) => j !== i);
    // La bonne réponse suit le décalage des options restantes.
    const correct = draft.correct === i ? 0 : draft.correct > i ? draft.correct - 1 : draft.correct;
    onPatch({ options, correct });
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>
          {t('Question {n}', { n: index + 1 })}
        </Text>
        <Row style={{ gap: 14 }}>
          <Pressable onPress={() => onMove(-1)} disabled={index === 0} hitSlop={6}>
            <Ionicons name="arrow-up" size={17} color={index === 0 ? C.dim : C.accent} />
          </Pressable>
          <Pressable onPress={() => onMove(1)} disabled={index === count - 1} hitSlop={6}>
            <Ionicons name="arrow-down" size={17} color={index === count - 1 ? C.dim : C.accent} />
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={6}>
            <Ionicons name="trash-outline" size={17} color={C.red} />
          </Pressable>
        </Row>
      </Row>

      <Field
        label={t('Intitulé')}
        placeholder={t('Ex. Quel club a remporté la D1 en 2024 ?')}
        value={draft.question}
        onChangeText={(v) => onPatch({ question: v })}
      />

      <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>
        {t('Options — touche le cercle pour désigner la bonne réponse')}
      </Text>
      <View style={{ gap: 8 }}>
        {draft.options.map((opt, i) => {
          const on = draft.correct === i;
          return (
            <Row key={i} style={{ gap: 8 }}>
              <Pressable onPress={() => onPatch({ correct: i })} hitSlop={6} style={{ paddingTop: 12 }}>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? C.green : C.dim}
                />
              </Pressable>
              <Field
                placeholder={t('Réponse {n}', { n: i + 1 })}
                value={opt}
                onChangeText={(v) => setOption(i, v)}
                style={{ borderColor: on ? C.green : C.borderStrong }}
              />
              {draft.options.length > 2 && (
                <Pressable onPress={() => removeOption(i)} hitSlop={6} style={{ paddingTop: 14 }}>
                  <Ionicons name="close-circle-outline" size={20} color={C.dim} />
                </Pressable>
              )}
            </Row>
          );
        })}
      </View>

      {draft.options.length < MAX_OPTIONS && (
        <Pressable onPress={() => onPatch({ options: [...draft.options, ''] })} style={{ marginTop: 10 }}>
          <Row style={{ gap: 6 }}>
            <Ionicons name="add-circle-outline" size={16} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 12.5 }}>{t('Ajouter une option')}</Text>
          </Row>
        </Pressable>
      )}

      <View
        style={{
          marginTop: 12,
          borderRadius: R.sm,
          backgroundColor: C.surface2,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>
          {t('Bonne réponse : {answer}', {
            answer: draft.options[draft.correct]?.trim() || t('à définir'),
          })}
        </Text>
      </View>
    </Card>
  );
}
