import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Crest, Field, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { AWARD_KINDS, awardKindLabel, deleteAward, listAwards, upsertAward } from '@/lib/db-awards';
import { listPlayers } from '@/lib/db';
import { errorMessage } from '@/lib/db-fan';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { AwardKind, Player } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function AdminAwards() {
  const { t } = useT();
  const awards = useFetch(() => listAwards(), []);
  const players = useFetch(() => listPlayers(), []);

  const [kind, setKind] = useState<AwardKind>('joueur_du_mois');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const byId = useMemo(() => new Map((players.data ?? []).map((p) => [p.id, p])), [players.data]);
  const selected = playerId ? byId.get(playerId) : undefined;
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players.data ?? []).filter((p) => (q ? p.full_name.toLowerCase().includes(q) : true)).slice(0, 20);
  }, [players.data, query]);

  async function add() {
    if (!playerId) {
      setErr(t('Choisis un joueur.'));
      return;
    }
    setErr(null);
    setFlash(null);
    setBusy(true);
    try {
      const player = byId.get(playerId);
      await upsertAward({
        kind,
        player_id: playerId,
        team_id: player?.team_id ?? null,
        season_id: null,
        label: label.trim() || null,
        note: note.trim() || null,
        awarded_at: null,
      });
      setPlayerId(null);
      setLabel('');
      setNote('');
      setQuery('');
      setFlash(t('Récompense ajoutée.'));
      await awards.reload();
    } catch (e) {
      setErr(errorMessage(e, t('Ajout impossible.')));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(t('Supprimer cette récompense ?'), t('Cette action est définitive.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAward(id);
            await awards.reload();
          } catch (e) {
            setErr(errorMessage(e, t('Suppression impossible.')));
          }
        },
      },
    ]);
  }

  const rows = awards.data ?? [];

  return (
    <Screen refreshing={awards.loading} onRefresh={() => awards.reload()}>
      <Header
        title={t('Récompenses')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg }}>
        <Card>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
            {t('Type de distinction')}
          </Text>
          <ChipSelect
            options={AWARD_KINDS.map((k) => ({ id: k.id, label: t(k.label) }))}
            value={kind}
            onChange={(v) => setKind(v as AwardKind)}
            wrap
          />

          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 }}>
            {t('Joueur')}
          </Text>
          {selected ? (
            <Row style={{ gap: 10, marginBottom: 8 }}>
              <Crest label={selected.full_name.slice(0, 2).toUpperCase()} size={28} round image={selected.photo_url} color={C.surface2} />
              <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{selected.full_name}</Text>
              <Pressable onPress={() => setPlayerId(null)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color={C.red} />
              </Pressable>
            </Row>
          ) : (
            <>
              <TextInput
                placeholder={t('Rechercher un joueur…')}
                placeholderTextColor={C.dim}
                value={query}
                onChangeText={setQuery}
                style={{
                  backgroundColor: C.inputBg,
                  borderWidth: 1,
                  borderColor: C.borderStrong,
                  borderRadius: R.sm,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: C.text,
                  fontSize: 14,
                }}
              />
              {query.trim() ? (
                <View style={{ marginTop: 6 }}>
                  {candidates.map((p: Player, i) => (
                    <Pressable key={p.id} onPress={() => { setPlayerId(p.id); setQuery(''); }}>
                      <Row
                        style={{
                          paddingVertical: 8,
                          gap: 10,
                          borderBottomWidth: i < candidates.length - 1 ? 1 : 0,
                          borderBottomColor: C.border,
                        }}>
                        <Crest label={p.full_name.slice(0, 2).toUpperCase()} size={24} round color={C.surface2} image={p.photo_url} />
                        <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={1}>
                          {p.full_name}
                        </Text>
                      </Row>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          )}

          <Field label={t('Intitulé (ex. Janvier 2026)')} value={label} onChangeText={setLabel} placeholder={t('Facultatif')} />
          <Field label={t('Note')} value={note} onChangeText={setNote} placeholder={t('Facultatif')} />

          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          {flash ? <Text style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{flash}</Text> : null}
          <Button title={t('Ajouter la récompense')} onPress={add} loading={busy} icon="trophy-outline" />
        </Card>
      </View>

      <SectionTitle title={t('Récompenses ({n})', { n: rows.length })} />
      <View style={{ paddingHorizontal: S.lg, gap: 9, paddingBottom: S.lg }}>
        {rows.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {awards.loading ? t('Chargement…') : t('Aucune récompense.')}
            </Text>
          </Card>
        ) : (
          rows.map((a) => (
            <Card key={a.id} style={{ paddingVertical: 10 }}>
              <Row style={{ gap: 12 }}>
                <Crest
                  label={(a.player?.full_name ?? '—').slice(0, 2).toUpperCase()}
                  size={32}
                  round
                  color={a.team?.color ?? C.surface2}
                  image={a.player?.photo_url}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                    {a.player?.full_name ?? t('Distinction')}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 12 }} numberOfLines={1}>
                    {[t(awardKindLabel(a.kind)), a.label, a.team ? teamShort(a.team) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(a.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={19} color={C.red} />
                </Pressable>
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
