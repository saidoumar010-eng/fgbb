import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Button, Field, Row } from '@/components/ui';
import { getMatch } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { MatchStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const STATUS = [
  { id: 'scheduled', label: 'À venir' },
  { id: 'live', label: 'En direct' },
  { id: 'finished', label: 'Terminé' },
];

type Q = { home: string; away: string };
const emptyQuarters: Q[] = [
  { home: '', away: '' },
  { home: '', away: '' },
  { home: '', away: '' },
  { home: '', away: '' },
];

export default function AdminMatchEdit() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: m, loading } = useFetch(() => getMatch(id), [id]);

  const [status, setStatus] = useState<MatchStatus>('scheduled');
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [quarters, setQuarters] = useState<Q[]>(emptyQuarters);
  const [videoUrl, setVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (m && !seeded.current) {
      setStatus(m.status);
      setHomeScore(String(m.home_score ?? 0));
      setAwayScore(String(m.away_score ?? 0));
      setVideoUrl(m.video_url ?? '');
      const q = [...emptyQuarters].map((_, i) => {
        const found = m.quarter_scores?.find((x) => x.q === i + 1);
        return found ? { home: String(found.home), away: String(found.away) } : { home: '', away: '' };
      });
      setQuarters(q);
      seeded.current = true;
    }
  }, [m]);

  function setQ(i: number, side: 'home' | 'away', v: string) {
    setQuarters((prev) => prev.map((q, idx) => (idx === i ? { ...q, [side]: v } : q)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    const qs = quarters
      .map((q, i) => ({ q: i + 1, home: parseInt(q.home || '0', 10), away: parseInt(q.away || '0', 10) }))
      .filter((q, i) => quarters[i].home !== '' || quarters[i].away !== '');
    const { error: err } = await supabase
      .from('matches')
      .update({
        status,
        home_score: parseInt(homeScore || '0', 10),
        away_score: parseInt(awayScore || '0', 10),
        quarter_scores: qs,
        video_url: videoUrl.trim() || null,
      })
      .eq('id', id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setFlash(t('Match mis à jour.'));
  }

  function confirmDelete() {
    Alert.alert(t('Supprimer le match'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          await supabase.from('matches').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  const title = m ? `${teamShort(m.home_team)} – ${teamShort(m.away_team)}` : t('Match');
  const statusOptions = STATUS.map((s) => ({ ...s, label: t(s.label) }));

  return (
    <AdminForm
      title={loading ? t('Match') : title}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={t('Enregistrer les modifications')}>
      <FormLabel>{t('Statut')}</FormLabel>
      <ChipSelect options={statusOptions} value={status} onChange={(v) => setStatus(v as MatchStatus)} wrap />

      <Row style={{ gap: 10 }}>
        <Field label={`${t('Score')} ${teamShort(m?.home_team)}`} keyboardType="number-pad" value={homeScore} onChangeText={setHomeScore} />
        <Field label={`${t('Score')} ${teamShort(m?.away_team)}`} keyboardType="number-pad" value={awayScore} onChangeText={setAwayScore} />
      </Row>

      <FormLabel>{t('Score par quart-temps (domicile - extérieur)')}</FormLabel>
      {quarters.map((q, i) => (
        <Row key={i} style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: C.dim, fontSize: 12, width: 28 }}>Q{i + 1}</Text>
          <Field placeholder="0" keyboardType="number-pad" value={q.home} onChangeText={(v) => setQ(i, 'home', v)} />
          <Text style={{ color: C.dim }}>-</Text>
          <Field placeholder="0" keyboardType="number-pad" value={q.away} onChangeText={(v) => setQ(i, 'away', v)} />
        </Row>
      ))}

      <Field
        label={t('Lien du résumé vidéo (YouTube/Facebook)')}
        placeholder="https://youtube.com/..."
        autoCapitalize="none"
        value={videoUrl}
        onChangeText={setVideoUrl}
      />

      <Button
        title={t('Contrôle en direct (temps réel)')}
        icon="radio-outline"
        onPress={() => router.push(`/admin/live/${id}`)}
      />
      <Button
        title={t('Saisir les statistiques (box score)')}
        tone="alt"
        icon="stats-chart-outline"
        onPress={() => router.push(`/admin/box-score/${id}`)}
      />
      <Button
        title={t('Saisir la carte des tirs')}
        tone="alt"
        icon="basketball-outline"
        onPress={() => router.push(`/admin/shots/${id}` as never)}
      />
      <Button
        title={t('Désigner les arbitres')}
        tone="alt"
        icon="people-circle-outline"
        onPress={() => router.push(`/admin/officials/${id}` as never)}
      />
      <Button title={t('Supprimer le match')} tone="alt" icon="trash-outline" onPress={confirmDelete} />
    </AdminForm>
  );
}
