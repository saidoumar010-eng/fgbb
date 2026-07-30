import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AdminForm } from '@/components/admin-form';
import { Button, Card, Empty, Header, Screen } from '@/components/ui';
import { getMatch, getMatchStats, getTeamPlayers } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { pickImageBase64 } from '@/lib/upload';
import { C, S } from '@/lib/theme';
import type { Player, PlayerMatchStat } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const FIELDS: { k: string; l: string; signed?: boolean }[] = [
  { k: 'minutes', l: 'MIN' },
  { k: 'points', l: 'PTS' },
  { k: 'rebounds', l: 'REB' },
  { k: 'off_rebounds', l: 'RO' },
  { k: 'assists', l: 'PD' },
  { k: 'steals', l: 'INT' },
  { k: 'blocks', l: 'CTR' },
  { k: 'turnovers', l: 'BP' },
  { k: 'fouls', l: 'FTE' },
  { k: 'fg_made', l: 'TR' },
  { k: 'fg_att', l: 'TT' },
  { k: 'three_made', l: '3R' },
  { k: 'three_att', l: '3T' },
  { k: 'ft_made', l: 'LFR' },
  { k: 'ft_att', l: 'LFT' },
  { k: 'plus_minus', l: '+/−', signed: true },
];

async function loadBox(id: string) {
  const m = await getMatch(id);
  const [home, away, stats] = await Promise.all([
    getTeamPlayers(m.home_team_id),
    getTeamPlayers(m.away_team_id),
    getMatchStats(id),
  ]);
  return { m, home, away, stats };
}

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Associe un joueur extrait de la feuille à un joueur de l'effectif (nom puis numéro).
function findRoster(rosters: Player[], ex: { name?: string; number?: number | null }): Player | null {
  const exNorm = norm(ex.name ?? '');
  const exTokens = exNorm.split(' ').filter((t) => t.length >= 3);
  const exact = rosters.find((r) => exNorm.length > 0 && norm(r.full_name) === exNorm);
  if (exact) return exact;
  const tok = rosters.find((r) => {
    const rt = norm(r.full_name).split(' ').filter((t) => t.length >= 3);
    return exTokens.some((t) => rt.includes(t));
  });
  if (tok) return tok;
  if (ex.number != null) {
    const byNum = rosters.find((r) => r.number === ex.number);
    if (byNum) return byNum;
  }
  return null;
}

export default function BoxScoreEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading } = useFetch(() => loadBox(id), [id]);
  const { t } = useT();
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (data && !seeded.current) {
      const init: Record<string, Record<string, string>> = {};
      data.stats.forEach((s: PlayerMatchStat) => {
        init[s.player_id] = {};
        FIELDS.forEach((f) => {
          init[s.player_id][f.k] = String((s as unknown as Record<string, number>)[f.k] ?? '');
        });
      });
      setVals(init);
      seeded.current = true;
    }
  }, [data]);

  if (!data) {
    return (
      <Screen>
        <Header
          title={t('Box score')}
          left={
            <Pressable onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={C.muted} />
            </Pressable>
          }
        />
        <Empty icon="stats-chart-outline" title={loading ? t('Chargement…') : t('Match introuvable')} />
      </Screen>
    );
  }

  const teamOf: Record<string, string> = {};
  data.home.forEach((p) => (teamOf[p.id] = data.m.home_team_id));
  data.away.forEach((p) => (teamOf[p.id] = data.m.away_team_id));

  function setVal(pid: string, k: string, v: string) {
    setVals((prev) => ({ ...prev, [pid]: { ...prev[pid], [k]: v } }));
  }

  async function importSheet() {
    setError(null);
    setFlash(null);
    setImporting(true);
    try {
      const img = await pickImageBase64();
      if (!img) {
        setImporting(false);
        return;
      }
      const { data: fn, error: err } = await supabase.functions.invoke('parse-match-sheet', {
        body: { image_base64: img.base64, media_type: img.mediaType },
      });
      if (err) throw new Error(err.message);
      if (fn?.error) throw new Error(fn.error);

      const rosters = [...data!.home, ...data!.away];
      const next: Record<string, Record<string, string>> = { ...vals };
      let matched = 0;
      const unmatched: string[] = [];
      for (const team of fn?.result?.teams ?? []) {
        for (const pl of team.players ?? []) {
          const r = findRoster(rosters, pl);
          if (r) {
            // La feuille de match ne couvre pas toutes les colonnes (minutes,
            // +/−, balles perdues…) : on ne remplace que ce qui a été lu et on
            // conserve ce que l'admin a déjà saisi à la main.
            const entry: Record<string, string> = { ...(next[r.id] ?? {}) };
            FIELDS.forEach((f) => {
              const read = (pl as Record<string, number>)[f.k];
              if (read != null) entry[f.k] = String(read);
            });
            next[r.id] = entry;
            matched++;
          } else if (pl.name) {
            unmatched.push(pl.name);
          }
        }
      }
      setVals(next);
      setFlash(
        t('{n} joueur(s) pré-remplis depuis la feuille.', { n: matched }) +
          (unmatched.length
            ? ' ' +
              t('Non reconnus : {names}', {
                names: `${unmatched.slice(0, 4).join(', ')}${unmatched.length > 4 ? '…' : ''}`,
              }) +
              '.'
            : '') +
          ' ' +
          t('Vérifie les chiffres puis enregistre.'),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Échec de l'analyse de la feuille de match."));
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    const rows: Record<string, unknown>[] = [];
    [...data!.home, ...data!.away].forEach((pl) => {
      const v = vals[pl.id];
      if (!v) return;
      const hasAny = FIELDS.some((f) => (v[f.k] ?? '') !== '');
      if (!hasAny) return;
      const row: Record<string, unknown> = { match_id: id, player_id: pl.id, team_id: teamOf[pl.id] };
      FIELDS.forEach((f) => (row[f.k] = parseInt((v[f.k] || '0').replace('−', '-'), 10) || 0));
      rows.push(row);
    });
    if (rows.length === 0) {
      setSaving(false);
      setError(t('Saisis les statistiques d’au moins un joueur.'));
      return;
    }
    const { error: err } = await supabase
      .from('player_match_stats')
      .upsert(rows, { onConflict: 'match_id,player_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setFlash(t('Statistiques enregistrées pour {n} joueur(s).', { n: rows.length }));
  }

  const noPlayers = data.home.length === 0 && data.away.length === 0;

  return (
    <AdminForm
      title={t('Saisir le box score')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={t('Enregistrer le box score')}>
      <Button
        title={t('Importer une feuille de match (IA)')}
        tone="alt"
        icon="sparkles-outline"
        loading={importing}
        onPress={importSheet}
      />
      <Text style={{ color: C.dim, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 10 }}>
        {t(
          'Photographie la feuille de match : l’IA lit les statistiques et pré-remplit les joueurs reconnus. Vérifie toujours les chiffres avant d’enregistrer.',
        )}
      </Text>
      <Text style={{ color: C.dim, fontSize: 11, lineHeight: 16, marginBottom: 4 }}>
        {t(
          'MIN minutes · PTS points · REB rebonds (RO offensifs) · PD passes · INT interceptions · CTR contres · BP balles perdues · FTE fautes · TR/TT tirs réussis/tentés · 3R/3T à 3 points · LFR/LFT lancers francs · +/− différentiel (un nombre négatif est accepté)',
        )}
      </Text>

      {noPlayers ? (
        <Card style={{ marginTop: 8 }}>
          <Text style={{ color: C.dim, fontSize: 13 }}>
            {t('Aucun joueur dans les effectifs de ces équipes. Ajoute d’abord des joueurs (Gestion → Joueurs).')}
          </Text>
        </Card>
      ) : (
        <>
          <TeamSection title={data.m.home_team?.name ?? t('Domicile')} players={data.home} vals={vals} onSet={setVal} />
          <TeamSection title={data.m.away_team?.name ?? t('Extérieur')} players={data.away} vals={vals} onSet={setVal} />
        </>
      )}
    </AdminForm>
  );
}

function TeamSection({
  title,
  players,
  vals,
  onSet,
}: {
  title: string;
  players: Player[];
  vals: Record<string, Record<string, string>>;
  onSet: (pid: string, k: string, v: string) => void;
}) {
  const { t } = useT();
  if (players.length === 0) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      <View style={{ gap: 10 }}>
        {players.map((p) => (
          <Card key={p.id}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              {p.number ? `#${p.number} ` : ''}
              {p.full_name}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FIELDS.map((f) => (
                <View key={f.k} style={{ width: 54 }}>
                  <Text style={{ color: C.dim, fontSize: 11, marginBottom: 3, textAlign: 'center' }}>{t(f.l)}</Text>
                  <TextInput
                    value={vals[p.id]?.[f.k] ?? ''}
                    onChangeText={(v) => onSet(p.id, f.k, v)}
                    keyboardType={f.signed ? 'numbers-and-punctuation' : 'number-pad'}
                    placeholder="0"
                    placeholderTextColor={C.dim}
                    style={{
                      backgroundColor: C.inputBg,
                      borderWidth: 1,
                      borderColor: C.borderStrong,
                      borderRadius: 8,
                      paddingVertical: 7,
                      color: C.text,
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  />
                </View>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}
