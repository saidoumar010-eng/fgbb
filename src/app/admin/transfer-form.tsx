import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field } from '@/components/ui';
import { listPlayers, listTeams } from '@/lib/db';
import { deleteTransfer, getTransfer, listSeasons, upsertTransfer } from '@/lib/db-federation';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { TransferStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const MAX_PLAYER_CHIPS = 24;

export default function TransferForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const players = useFetch(() => listPlayers());
  const teams = useFetch(() => listTeams());
  const seasons = useFetch(() => listSeasons());
  const existing = useFetch(async () => (id ? getTransfer(id) : null), [id]);

  const [playerId, setPlayerId] = useState<string | undefined>();
  const [playerSearch, setPlayerSearch] = useState('');
  const [fromTeamId, setFromTeamId] = useState<string | undefined>();
  const [toTeamId, setToTeamId] = useState<string | undefined>();
  const [seasonId, setSeasonId] = useState<string | undefined>();
  const [status, setStatus] = useState<TransferStatus>('pending');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const tr = existing.data;
    if (tr && !seeded.current) {
      setPlayerId(tr.player_id);
      setFromTeamId(tr.from_team_id ?? undefined);
      setToTeamId(tr.to_team_id ?? undefined);
      setSeasonId(tr.season_id ?? undefined);
      setStatus(tr.status);
      setNote(tr.note ?? '');
      seeded.current = true;
    }
  }, [existing.data]);

  useEffect(() => {
    if (!editing && !seasonId) {
      const current = (seasons.data ?? []).find((s) => s.is_current);
      if (current) setSeasonId(current.id);
    }
  }, [seasons.data, editing, seasonId]);

  const playerOptions = useMemo(() => {
    const all = players.data ?? [];
    const q = playerSearch.trim().toLowerCase();
    const matching = q ? all.filter((p) => p.full_name.toLowerCase().includes(q)) : all;
    const shown = matching.slice(0, MAX_PLAYER_CHIPS);
    const selected = all.find((p) => p.id === playerId);
    if (selected && !shown.some((p) => p.id === selected.id)) shown.unshift(selected);
    return shown.map((p) => ({ id: p.id, label: p.full_name }));
  }, [players.data, playerSearch, playerId]);

  function choosePlayer(nextId: string) {
    setPlayerId(nextId);
    // Le club de départ est, par défaut, celui où le joueur est actuellement inscrit.
    const p = (players.data ?? []).find((x) => x.id === nextId);
    if (p?.team_id) setFromTeamId(p.team_id);
  }

  const teamOptions = (teams.data ?? []).map((tm) => ({ id: tm.id, label: tm.name, color: tm.color }));

  async function save() {
    if (!playerId) {
      setError(t('Sélectionne le joueur concerné par le transfert.'));
      return;
    }
    if (!toTeamId) {
      setError(t('Sélectionne le club d’accueil.'));
      return;
    }
    if (fromTeamId && fromTeamId === toTeamId) {
      setError(t('Le club de départ et le club d’accueil doivent être différents.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertTransfer({
        id,
        player_id: playerId,
        from_team_id: fromTeamId ?? null,
        to_team_id: toTeamId,
        season_id: seasonId ?? null,
        status,
        note: note.trim() || null,
      });
      if (editing) {
        setFlash(t('Transfert mis à jour.'));
      } else {
        setFlash(t('Demande de transfert enregistrée.'));
        setPlayerId(undefined);
        setPlayerSearch('');
        setFromTeamId(undefined);
        setToTeamId(undefined);
        setStatus('pending');
        setNote('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer le transfert'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteTransfer(id);
            goBack();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Erreur de chargement'));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier le transfert') : t('Nouveau transfert')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer le transfert')}>
      <Field
        label={t('Joueur')}
        placeholder={t('Rechercher un joueur')}
        value={playerSearch}
        onChangeText={setPlayerSearch}
        autoCapitalize="none"
      />
      <View style={{ marginTop: 10 }}>
        {playerOptions.length === 0 ? (
          <Text style={{ color: C.dim, fontSize: 12 }}>{t('Aucun joueur trouvé')}</Text>
        ) : (
          <ChipSelect options={playerOptions} value={playerId} onChange={choosePlayer} wrap />
        )}
      </View>

      <FormLabel>{t('Club de départ')}</FormLabel>
      <ChipSelect options={teamOptions} value={fromTeamId} onChange={setFromTeamId} />

      <FormLabel>{t('Club d’accueil')}</FormLabel>
      <ChipSelect options={teamOptions} value={toTeamId} onChange={setToTeamId} />

      <FormLabel>{t('Saison')}</FormLabel>
      <ChipSelect
        options={(seasons.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
        value={seasonId}
        onChange={setSeasonId}
      />

      <FormLabel>{t('Statut')}</FormLabel>
      <ChipSelect
        options={[
          { id: 'pending', label: t('En attente') },
          { id: 'approved', label: t('Approuvé') },
          { id: 'rejected', label: t('Rejeté') },
        ]}
        value={status}
        onChange={(v) => setStatus(v as TransferStatus)}
        wrap
      />
      <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 4 }}>
        {t('À l’approbation, le joueur est automatiquement rattaché à son club d’accueil.')}
      </Text>

      <Field
        label={t('Motif / note')}
        placeholder={t('Précisions sur la mutation')}
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 80, paddingTop: 11 }}
      />

      {editing ? (
        <Button title={t('Supprimer le transfert')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
