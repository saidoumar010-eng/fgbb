import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { AdminForm, FormLabel } from '@/components/admin-form';
import { ChipSelect } from '@/components/chip-select';
import { Field, Row } from '@/components/ui';
import { listCompetitions, listTeams } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { notifySubscribers } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { MatchStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const STATUS = [
  { id: 'scheduled', label: 'À venir' },
  { id: 'live', label: 'En direct' },
  { id: 'finished', label: 'Terminé' },
];

export default function MatchForm() {
  const { t } = useT();
  const teams = useFetch(() => listTeams());
  const comps = useFetch(() => listCompetitions());

  const [competitionId, setCompetitionId] = useState<string | undefined>();
  const [homeId, setHomeId] = useState<string | undefined>();
  const [awayId, setAwayId] = useState<string | undefined>();
  const [status, setStatus] = useState<MatchStatus>('scheduled');
  const [scheduledAt, setScheduledAt] = useState('');
  const [venue, setVenue] = useState('');
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [videoUrl, setVideoUrl] = useState('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const teamOptions = (teams.data ?? []).map((team) => ({ id: team.id, label: team.name, color: team.color }));
  const statusOptions = STATUS.map((s) => ({ ...s, label: t(s.label) }));

  async function save() {
    if (!homeId || !awayId) {
      setError(t('Sélectionne les deux équipes.'));
      return;
    }
    if (homeId === awayId) {
      setError(t('Les deux équipes doivent être différentes.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const { error: err } = await supabase.from('matches').insert({
      competition_id: competitionId ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      status,
      scheduled_at: scheduledAt.trim() || null,
      venue: venue.trim() || null,
      home_score: status === 'scheduled' ? 0 : parseInt(homeScore || '0', 10),
      away_score: status === 'scheduled' ? 0 : parseInt(awayScore || '0', 10),
      video_url: videoUrl.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (notify) {
      const home = (teams.data ?? []).find((team) => team.id === homeId);
      const away = (teams.data ?? []).find((team) => team.id === awayId);
      await notifySubscribers({
        title: status === 'scheduled' ? 'Nouveau match programmé' : 'Résultat de match',
        body: `${home?.name ?? ''} vs ${away?.name ?? ''}`,
        team_ids: [homeId, awayId].filter(Boolean) as string[],
      });
    }
    setFlash(t('Match enregistré et publié.'));
    setHomeId(undefined);
    setAwayId(undefined);
    setScheduledAt('');
    setVenue('');
    setHomeScore('0');
    setAwayScore('0');
    setVideoUrl('');
  }

  return (
    <AdminForm
      title={t('Saisir / programmer un match')}
      onSave={save}
      saving={saving}
      error={error}
      flash={flash}
      saveLabel={t('Publier le match')}>
      <FormLabel>{t('Compétition')}</FormLabel>
      <ChipSelect
        options={(comps.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        value={competitionId}
        onChange={setCompetitionId}
      />

      <FormLabel>{t('Équipe à domicile')}</FormLabel>
      <ChipSelect options={teamOptions} value={homeId} onChange={setHomeId} />

      <FormLabel>{t("Équipe à l'extérieur")}</FormLabel>
      <ChipSelect options={teamOptions} value={awayId} onChange={setAwayId} />

      <FormLabel>{t('Statut')}</FormLabel>
      <ChipSelect options={statusOptions} value={status} onChange={(v) => setStatus(v as MatchStatus)} wrap />

      {status !== 'scheduled' && (
        <Row style={{ gap: 10 }}>
          <Field label={t('Score domicile')} keyboardType="number-pad" value={homeScore} onChangeText={setHomeScore} />
          <Field label={t('Score extérieur')} keyboardType="number-pad" value={awayScore} onChangeText={setAwayScore} />
        </Row>
      )}

      <Row style={{ gap: 10 }}>
        <Field label={t('Date & heure')} placeholder={t('AAAA-MM-JJ HH:MM')} value={scheduledAt} onChangeText={setScheduledAt} />
        <Field label={t('Lieu')} placeholder="Palais des Sports" value={venue} onChangeText={setVenue} />
      </Row>

      <Field label={t('Lien du résumé vidéo (YouTube/Facebook)')} placeholder="https://youtube.com/..." autoCapitalize="none" value={videoUrl} onChangeText={setVideoUrl} />

      <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14 }}>{t('Notifier les supporters')}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>{t('Alerte aux abonnés des deux équipes')}</Text>
        </View>
        <Switch value={notify} onValueChange={setNotify} trackColor={{ false: '#2A3140', true: C.green }} thumbColor="#fff" />
      </Row>
    </AdminForm>
  );
}
