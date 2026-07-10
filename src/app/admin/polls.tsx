import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Field, Header, Pill, Row, Screen } from '@/components/ui';
import { createPoll, deletePoll, listPolls, setPollActive } from '@/lib/db';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

// Gestion des sondages de la fan zone (espace fédération).
export default function AdminPolls() {
  const polls = useFetch(() => listPolls());
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) {
      setErr('Renseigne une question et au moins deux options.');
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
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Supprimer le sondage', 'Les votes associés seront également supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
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
        title="Sondages"
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Card>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>Nouveau sondage</Text>
          <Field
            label="Question"
            placeholder="Ex. Quelle équipe remportera la D1 ?"
            value={question}
            onChangeText={setQuestion}
          />
          {options.map((opt, i) => (
            <Row key={i} style={{ gap: 8, alignItems: 'flex-end' }}>
              <Field
                label={`Option ${i + 1}`}
                placeholder={`Réponse ${i + 1}`}
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
                <Text style={{ color: C.accent, fontSize: 13 }}>Ajouter une option</Text>
              </Row>
            </Pressable>
          )}
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}
          <Button title="Publier le sondage" onPress={submit} loading={busy} icon="megaphone-outline" />
        </Card>

        {(polls.data ?? []).length === 0 ? (
          <Empty icon="megaphone-outline" title={polls.loading ? 'Chargement…' : 'Aucun sondage'} />
        ) : (
          (polls.data ?? []).map((p) => (
            <Card key={p.id}>
              <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1 }}>{p.question}</Text>
                <Pill label={p.is_active ? 'Actif' : 'Clos'} tone={p.is_active ? 'green' : 'neutral'} />
              </Row>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{p.options.join(' · ')}</Text>
              <Row style={{ gap: 16, marginTop: 10 }}>
                <Pressable
                  onPress={async () => {
                    await setPollActive(p.id, !p.is_active).catch(() => {});
                    polls.reload();
                  }}>
                  <Text style={{ color: C.accent, fontSize: 12.5 }}>
                    {p.is_active ? 'Clore le sondage' : 'Réactiver'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(p.id)}>
                  <Text style={{ color: C.red, fontSize: 12.5 }}>Supprimer</Text>
                </Pressable>
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
