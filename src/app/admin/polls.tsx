import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Field, Header, Pill, Row, Screen } from '@/components/ui';
import { createPoll, deletePoll, listPolls, setPollActive } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Gestion des sondages de la fan zone (espace fédération).
export default function AdminPolls() {
  const polls = useFetch(() => listPolls());
  const { t } = useT();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) {
      setErr(t('Renseigne une question et au moins deux options.'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createPoll(question.trim(), cleaned);
      setQuestion('');
      setOptions(['', '']);
      await polls.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Erreur'));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(t('Supprimer le sondage'), t('Les votes associés seront également supprimés.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await deletePoll(id).catch(() => {});
          polls.reload();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Header
        title={t('Sondages')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Card>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Nouveau sondage')}</Text>
          <Field
            label={t('Question')}
            placeholder={t('Ex. Quelle équipe remportera la D1 ?')}
            value={question}
            onChangeText={setQuestion}
          />
          {options.map((opt, i) => (
            <Row key={i} style={{ gap: 8, alignItems: 'flex-end' }}>
              <Field
                label={t('Option {n}', { n: i + 1 })}
                placeholder={t('Réponse {n}', { n: i + 1 })}
                value={opt}
                onChangeText={(v) => setOptions((prev) => prev.map((o, j) => (j === i ? v : o)))}
              />
              {options.length > 2 && (
                <Pressable
                  onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  style={{ paddingBottom: 13 }}>
                  <Ionicons name="close-circle-outline" size={22} color={C.dim} />
                </Pressable>
              )}
            </Row>
          ))}
          {options.length < 6 && (
            <Pressable onPress={() => setOptions((prev) => [...prev, ''])} style={{ marginTop: 10 }}>
              <Row style={{ gap: 6 }}>
                <Ionicons name="add-circle-outline" size={18} color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 13 }}>{t('Ajouter une option')}</Text>
              </Row>
            </Pressable>
          )}
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}
          <Button title={t('Publier le sondage')} onPress={submit} loading={busy} icon="megaphone-outline" />
        </Card>

        {(polls.data ?? []).length === 0 ? (
          <Empty icon="megaphone-outline" title={polls.loading ? t('Chargement…') : t('Aucun sondage')} />
        ) : (
          (polls.data ?? []).map((p) => (
            <Card key={p.id}>
              <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1 }}>{p.question}</Text>
                <Pill label={p.is_active ? t('Actif') : t('Clos')} tone={p.is_active ? 'green' : 'neutral'} />
              </Row>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{p.options.join(' · ')}</Text>
              <Row style={{ gap: 16, marginTop: 10 }}>
                <Pressable
                  onPress={async () => {
                    await setPollActive(p.id, !p.is_active).catch(() => {});
                    polls.reload();
                  }}>
                  <Text style={{ color: C.accent, fontSize: 12.5 }}>
                    {p.is_active ? t('Clore le sondage') : t('Réactiver')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(p.id)}>
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
