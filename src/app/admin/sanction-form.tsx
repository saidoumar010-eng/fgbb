import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field } from '@/components/ui';
import { listPlayers, listTeams } from '@/lib/db';
import {
  deleteSanction,
  getSanction,
  SANCTION_KINDS,
  SANCTION_STATUSES,
  upsertSanction,
} from '@/lib/db-officials';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { SanctionKind, SanctionStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Target = 'player' | 'team';

// La liste des joueurs peut être longue : on n'affiche que les premiers
// résultats de la recherche pour garder la bande de chips utilisable.
const MAX_PLAYER_CHIPS = 40;

export default function SanctionForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const players = useFetch(() => listPlayers());
  const teams = useFetch(() => listTeams());
  const existing = useFetch(async () => (id ? getSanction(id) : null), [id]);

  const [target, setTarget] = useState<Target>('player');
  const [playerId, setPlayerId] = useState<string | undefined>();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<SanctionKind>('avertissement');
  const [games, setGames] = useState('1');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [decidedAt, setDecidedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<SanctionStatus>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const s = existing.data;
    if (s && !seeded.current) {
      setTarget(s.player_id ? 'player' : 'team');
      setPlayerId(s.player_id ?? undefined);
      setTeamId(s.team_id ?? undefined);
      setKind(s.kind);
      setGames(String(s.games || 1));
      setAmount(s.amount_gnf ? String(s.amount_gnf) : '');
      setReason(s.reason ?? '');
      setDecidedAt(s.decided_at);
      setStatus(s.status);
      seeded.current = true;
    }
  }, [existing.data]);

  const playerOptions = useMemo(() => {
    const all = players.data ?? [];
    const q = search.trim().toLowerCase();
    const matching = q ? all.filter((p) => p.full_name.toLowerCase().includes(q)) : all;
    const shown = matching.slice(0, MAX_PLAYER_CHIPS);
    // Le joueur déjà sanctionné doit rester visible même hors de la recherche.
    const selected = all.find((p) => p.id === playerId);
    if (selected && !shown.some((p) => p.id === selected.id)) shown.unshift(selected);
    return shown.map((p) => ({ id: p.id, label: p.full_name }));
  }, [players.data, search, playerId]);

  async function save() {
    const finalPlayer = target === 'player' ? (playerId ?? null) : null;
    const finalTeam = target === 'team' ? (teamId ?? null) : null;
    if (!finalPlayer && !finalTeam) {
      setError(t('Choisis le joueur ou le club sanctionné.'));
      return;
    }
    const parsedGames = kind === 'suspension' ? parseInt(games || '0', 10) : 0;
    const parsedAmount = kind === 'amende' ? parseInt(amount || '0', 10) : 0;
    if (kind === 'suspension' && (!parsedGames || parsedGames < 1)) {
      setError(t('Indique le nombre de matchs de suspension.'));
      return;
    }
    if (kind === 'amende' && (!parsedAmount || parsedAmount < 1)) {
      setError(t("Indique le montant de l'amende."));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(decidedAt.trim())) {
      setError(t('La date de décision doit être au format AAAA-MM-JJ.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertSanction(
        {
          player_id: finalPlayer,
          team_id: finalTeam,
          match_id: existing.data?.match_id ?? null,
          kind,
          games: parsedGames,
          amount_gnf: parsedAmount,
          reason: reason.trim() || null,
          decided_at: decidedAt.trim(),
          status,
        },
        id ?? null,
      );
      if (editing) {
        setFlash(t('Sanction mise à jour.'));
      } else {
        setFlash(t('Sanction publiée.'));
        setPlayerId(undefined);
        setTeamId(undefined);
        setReason('');
        setAmount('');
        setGames('1');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer la sanction'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteSanction(id);
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
      title={editing ? t('Modifier la sanction') : t('Nouvelle sanction')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Publier la sanction')}>
      <FormLabel>{t('Sanction visant')}</FormLabel>
      <ChipSelect
        options={[
          { id: 'player', label: t('Un joueur') },
          { id: 'team', label: t('Un club') },
        ]}
        value={target}
        onChange={(v) => setTarget(v as Target)}
        wrap
      />

      {target === 'player' ? (
        <>
          <Field
            label={t('Rechercher un joueur')}
            placeholder={t('Nom du joueur')}
            value={search}
            onChangeText={setSearch}
          />
          <FormLabel>{t('Joueur')}</FormLabel>
          <ChipSelect options={playerOptions} value={playerId} onChange={setPlayerId} />
        </>
      ) : (
        <>
          <FormLabel>{t('Club')}</FormLabel>
          <ChipSelect
            options={(teams.data ?? []).map((tm) => ({ id: tm.id, label: tm.name, color: tm.color }))}
            value={teamId}
            onChange={setTeamId}
          />
        </>
      )}

      <FormLabel>{t('Type de sanction')}</FormLabel>
      <ChipSelect
        options={SANCTION_KINDS.map((k) => ({ id: k.id, label: t(k.label) }))}
        value={kind}
        onChange={(v) => setKind(v as SanctionKind)}
        wrap
      />

      {kind === 'suspension' ? (
        <Field
          label={t('Nombre de matchs de suspension')}
          placeholder="2"
          keyboardType="number-pad"
          value={games}
          onChangeText={setGames}
        />
      ) : null}

      {kind === 'amende' ? (
        <Field
          label={t('Montant en GNF')}
          placeholder="500000"
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
      ) : null}

      <Field
        label={t('Motif')}
        placeholder={t('Faits reprochés et référence de la décision')}
        multiline
        style={{ minHeight: 90, paddingTop: 12 }}
        value={reason}
        onChangeText={setReason}
      />

      <Field
        label={t('Date de la décision')}
        placeholder="AAAA-MM-JJ"
        value={decidedAt}
        onChangeText={setDecidedAt}
      />

      <FormLabel>{t('Statut')}</FormLabel>
      <ChipSelect
        options={SANCTION_STATUSES.map((s) => ({ id: s.id, label: t(s.label) }))}
        value={status}
        onChange={(v) => setStatus(v as SanctionStatus)}
        wrap
      />

      <Text style={{ color: C.dim, fontSize: 12, marginTop: 14 }}>
        {t('Les décisions sont publiées immédiatement dans la rubrique Discipline.')}
      </Text>

      {editing ? (
        <Button title={t('Supprimer la sanction')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
