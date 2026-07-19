import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field, Row } from '@/components/ui';
import { listPlayers, listTeams } from '@/lib/db';
import { deleteLicense, getLicense, listSeasons, upsertLicense } from '@/lib/db-federation';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { LicenseStatus } from '@/lib/types';
import { pickAndUploadDocument, signedDocumentUrl } from '@/lib/upload';
import { useFetch } from '@/lib/useFetch';

// Au-delà de cette taille, la liste de chips devient illisible : l'admin filtre
// d'abord par nom.
const MAX_PLAYER_CHIPS = 24;

export default function LicenseForm() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const players = useFetch(() => listPlayers());
  const teams = useFetch(() => listTeams());
  const seasons = useFetch(() => listSeasons());
  const existing = useFetch(async () => (id ? getLicense(id) : null), [id]);

  const [playerId, setPlayerId] = useState<string | undefined>();
  const [playerSearch, setPlayerSearch] = useState('');
  const [seasonId, setSeasonId] = useState<string | undefined>();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<LicenseStatus>('pending');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const l = existing.data;
    if (l && !seeded.current) {
      setPlayerId(l.player_id);
      setSeasonId(l.season_id ?? undefined);
      setTeamId(l.team_id ?? undefined);
      setNumber(l.number ?? '');
      setStatus(l.status);
      setIssuedAt(l.issued_at ?? '');
      setExpiresAt(l.expires_at ?? '');
      setDocumentPath(l.document_url ?? null);
      setNote(l.note ?? '');
      seeded.current = true;
    }
  }, [existing.data]);

  // Nouvelle licence : la saison en cours est le choix attendu dans 99 % des cas.
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
    // Le joueur déjà sélectionné doit rester visible même hors de la recherche.
    const selected = all.find((p) => p.id === playerId);
    if (selected && !shown.some((p) => p.id === selected.id)) shown.unshift(selected);
    return shown.map((p) => ({ id: p.id, label: p.full_name }));
  }, [players.data, playerSearch, playerId]);

  function choosePlayer(nextId: string) {
    setPlayerId(nextId);
    // Le club de la licence suit l'effectif actuel du joueur, sauf choix contraire.
    const p = (players.data ?? []).find((x) => x.id === nextId);
    if (p?.team_id && !teamId) setTeamId(p.team_id);
  }

  async function attachDocument() {
    setError(null);
    setUploading(true);
    try {
      const path = await pickAndUploadDocument('licenses');
      if (path) setDocumentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setUploading(false);
    }
  }

  async function openDocument() {
    if (!documentPath) return;
    // Le bucket est privé : on passe par une URL signée à durée limitée.
    const url = await signedDocumentUrl(documentPath);
    if (!url) {
      setError(t('Impossible d’ouvrir le justificatif.'));
      return;
    }
    Linking.openURL(url).catch(() => setError(t('Impossible d’ouvrir le justificatif.')));
  }

  async function save() {
    if (!playerId) {
      setError(t('Sélectionne le joueur titulaire de la licence.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      await upsertLicense({
        id,
        player_id: playerId,
        season_id: seasonId ?? null,
        team_id: teamId ?? null,
        number: number.trim() || null,
        status,
        issued_at: issuedAt.trim() || null,
        expires_at: expiresAt.trim() || null,
        document_url: documentPath,
        note: note.trim() || null,
      });
      if (editing) {
        setFlash(t('Licence mise à jour.'));
      } else {
        setFlash(t('Licence enregistrée.'));
        setPlayerId(undefined);
        setPlayerSearch('');
        setNumber('');
        setStatus('pending');
        setIssuedAt('');
        setExpiresAt('');
        setDocumentPath(null);
        setNote('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer la licence'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteLicense(id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Erreur de chargement'));
          }
        },
      },
    ]);
  }

  return (
    <AdminForm
      title={editing ? t('Modifier la licence') : t('Nouvelle licence')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={editing ? t('Enregistrer les modifications') : t('Enregistrer la licence')}>
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

      <FormLabel>{t('Saison')}</FormLabel>
      <ChipSelect
        options={(seasons.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
        value={seasonId}
        onChange={setSeasonId}
      />

      <FormLabel>{t('Club')}</FormLabel>
      <ChipSelect
        options={(teams.data ?? []).map((tm) => ({ id: tm.id, label: tm.name, color: tm.color }))}
        value={teamId}
        onChange={setTeamId}
      />

      <FormLabel>{t('Statut')}</FormLabel>
      <ChipSelect
        options={[
          { id: 'pending', label: t('En attente') },
          { id: 'valid', label: t('Valide') },
          { id: 'suspended', label: t('Suspendue') },
          { id: 'expired', label: t('Expirée') },
        ]}
        value={status}
        onChange={(v) => setStatus(v as LicenseStatus)}
        wrap
      />

      <Field
        label={t('Numéro de licence')}
        placeholder="GN-2026-0142"
        value={number}
        onChangeText={setNumber}
        autoCapitalize="characters"
      />

      <Row style={{ gap: 10 }}>
        <Field label={t('Délivrée le')} placeholder={t('AAAA-MM-JJ')} value={issuedAt} onChangeText={setIssuedAt} />
        <Field label={t('Expire le')} placeholder={t('AAAA-MM-JJ')} value={expiresAt} onChangeText={setExpiresAt} />
      </Row>

      <FormLabel>{t('Justificatif')}</FormLabel>
      <View
        style={{
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: R.md,
          padding: S.md,
          gap: 10,
        }}>
        <Row style={{ gap: 10 }}>
          <Ionicons
            name={documentPath ? 'document-text' : 'document-attach-outline'}
            size={20}
            color={documentPath ? C.accent : C.dim}
          />
          <Text style={{ color: documentPath ? C.text : C.dim, fontSize: 13, flex: 1 }}>
            {documentPath ? t('Document joint') : t('Aucun document joint')}
          </Text>
          {uploading ? <ActivityIndicator color={C.accent} /> : null}
        </Row>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>
          {t('Le justificatif est stocké dans un espace privé, visible uniquement par la fédération.')}
        </Text>
        <Row style={{ gap: 16 }}>
          <Pressable onPress={attachDocument} disabled={uploading}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>
              {documentPath ? t('Remplacer') : t('Joindre un document')}
            </Text>
          </Pressable>
          {documentPath ? (
            <Pressable onPress={openDocument}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{t('Consulter')}</Text>
            </Pressable>
          ) : null}
          {documentPath ? (
            <Pressable onPress={() => setDocumentPath(null)}>
              <Text style={{ color: C.red, fontSize: 13, fontWeight: '600' }}>{t('Retirer')}</Text>
            </Pressable>
          ) : null}
        </Row>
      </View>

      <Field
        label={t('Note interne')}
        placeholder={t('Observation de la commission')}
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 80, paddingTop: 11 }}
      />

      {editing ? (
        <Button title={t('Supprimer la licence')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
      ) : null}
    </AdminForm>
  );
}
