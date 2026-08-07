import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, Crest, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { listTeams } from '@/lib/db';
import { errorMessage } from '@/lib/db-fan';
import { deleteClubMessage, listSentClubMessages, sendClubMessage } from '@/lib/db-messages';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { SentClubMessage } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function AdminClubMessages() {
  const { t } = useT();
  const teams = useFetch(() => listTeams(), []);
  const sent = useFetch(() => listSentClubMessages(), []);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!title.trim() || !body.trim() || selected.size === 0) {
      setErr(t('Un titre, un message et au moins un club destinataire.'));
      return;
    }
    setErr(null);
    setFlash(null);
    setBusy(true);
    try {
      await sendClubMessage(title, body, [...selected]);
      setTitle('');
      setBody('');
      setSelected(new Set());
      setFlash(t('Message envoyé.'));
      await sent.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Envoi impossible.')));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(t('Supprimer ce message ?'), t('Cette action est définitive.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClubMessage(id);
            await sent.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Suppression impossible.')));
          }
        },
      },
    ]);
  }

  const rows = sent.data ?? [];
  const allTeams = teams.data ?? [];

  return (
    <Screen refreshing={sent.loading} onRefresh={() => sent.reload()}>
      <Header
        title={t('Messages aux clubs')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg }}>
        <Card>
          <Field label={t('Titre')} value={title} onChangeText={setTitle} placeholder={t('Objet du message')} />
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, marginBottom: 6 }}>{t('Message')}</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder={t('Écris ton message…')}
            placeholderTextColor={C.dim}
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

          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>
            {t('Clubs destinataires ({n})', { n: selected.size })}
          </Text>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {allTeams.map((tm) => {
              const on = selected.has(tm.id);
              return (
                <Pressable
                  key={tm.id}
                  onPress={() => toggle(tm.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: R.pill,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: on ? C.accent : C.border,
                    backgroundColor: on ? C.accentSoft : 'transparent',
                  }}>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={15}
                    color={on ? C.accent : C.dim}
                  />
                  <Text style={{ color: on ? C.accent : C.muted, fontSize: 12.5 }}>{tm.name}</Text>
                </Pressable>
              );
            })}
          </Row>

          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
          <Button title={t('Envoyer')} onPress={send} loading={busy} icon="send-outline" />
        </Card>
      </View>

      <SectionTitle title={t('Messages envoyés ({n})', { n: rows.length })} />
      <View style={{ paddingHorizontal: S.lg, gap: 9, paddingBottom: S.lg }}>
        {rows.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {sent.loading ? t('Chargement…') : t('Aucun message envoyé.')}
            </Text>
          </Card>
        ) : (
          rows.map((m) => <SentCard key={m.id} message={m} onDelete={() => confirmDelete(m.id)} />)
        )}
      </View>
    </Screen>
  );
}

function SentCard({ message: m, onDelete }: { message: SentClubMessage; onDelete: () => void }) {
  const { t } = useT();
  const readCount = m.recipients.filter((r) => r.read_at).length;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {m.title}
        </Text>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={17} color={C.red} />
        </Pressable>
      </Row>
      <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={2}>
        {m.body}
      </Text>
      <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>
        {fullDate(m.created_at)} · {t('lu par {r}/{n}', { r: readCount, n: m.recipients.length })}
      </Text>
      <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {m.recipients.map((r) => (
          <Row
            key={r.team_id}
            style={{
              gap: 5,
              borderRadius: R.pill,
              paddingHorizontal: 9,
              paddingVertical: 4,
              backgroundColor: r.read_at ? 'rgba(59,214,27,0.14)' : C.surface2,
            }}>
            <Crest label={teamShort(r.team)} color={r.team?.color ?? C.surface2} size={16} />
            <Text style={{ color: r.read_at ? C.green : C.dim, fontSize: 11 }}>
              {teamShort(r.team)}
            </Text>
            {r.read_at ? <Ionicons name="checkmark" size={12} color={C.green} /> : null}
          </Row>
        ))}
      </Row>
    </Card>
  );
}
