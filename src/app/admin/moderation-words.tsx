import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Field, Header, Row, Screen } from '@/components/ui';
import { addModerationWord, listModerationWords, removeModerationWord } from '@/lib/db-community';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function AdminModerationWords() {
  const { t } = useT();
  const words = useFetch(() => listModerationWords());
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cleaned = word.trim().toLowerCase();

  async function add() {
    if (cleaned.length < 2) {
      setErr(t('Saisis un mot d’au moins deux lettres.'));
      return;
    }
    if ((words.data ?? []).includes(cleaned)) {
      setErr(t('Ce mot est déjà dans la liste.'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await addModerationWord(cleaned);
      setWord('');
      await words.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Erreur'));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(w: string) {
    Alert.alert(t('Retirer ce mot'), t('Les messages contenant « {word} » ne seront plus refusés.', { word: w }), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Retirer'),
        style: 'destructive',
        onPress: async () => {
          await removeModerationWord(w).catch(() => {});
          words.reload();
        },
      },
    ]);
  }

  const list = words.data ?? [];

  return (
    <Screen>
      <Header
        title={t('Mots interdits')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: 12 }}>
        <Card style={{ borderColor: 'rgba(226,59,59,0.35)' }}>
          <Row style={{ gap: 7, marginBottom: 6 }}>
            <Ionicons name="warning-outline" size={16} color={C.red} />
            <Text style={{ color: C.red, fontSize: 12, fontWeight: '600' }}>{t('À utiliser avec précaution')}</Text>
          </Row>
          <Text style={{ color: C.muted, fontSize: 12.5, lineHeight: 18 }}>
            {t(
              'Le filtre refuse tout message qui contient la suite de lettres, même à l’intérieur d’un autre mot. Un mot court comme « con » bloquerait donc « second » ou « conseil ». Préfère des mots complets et sans ambiguïté.',
            )}
          </Text>
        </Card>

        <Card>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Ajouter un mot')}</Text>
          <Row style={{ gap: 8, alignItems: 'flex-end' }}>
            <Field
              label={t('Mot ou expression')}
              placeholder={t('Ex. insulte')}
              value={word}
              onChangeText={setWord}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={add}
            />
          </Row>
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}
          <Button title={t('Ajouter à la liste')} icon="add" onPress={add} loading={busy} />
        </Card>

        {list.length === 0 ? (
          <Empty
            icon="filter-outline"
            title={words.loading ? t('Chargement…') : t('Aucun mot interdit')}
            subtitle={words.loading ? undefined : t('Les messages des supporters ne sont filtrés que sur les mots ajoutés ici.')}
          />
        ) : (
          <Card>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 10 }}>
              {t('{n} mot(s) filtré(s)', { n: list.length })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {list.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => confirmRemove(w)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: R.pill,
                      borderWidth: 1,
                      borderColor: C.border,
                      backgroundColor: C.surface2,
                    },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Text style={{ color: C.text, fontSize: 12.5 }}>{w}</Text>
                  <Ionicons name="close-circle" size={15} color={C.dim} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}
