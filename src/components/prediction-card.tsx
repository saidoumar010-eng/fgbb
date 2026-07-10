import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Crest, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listPredictions, votePrediction } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, R } from '@/lib/theme';
import type { Match } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Pronostic des supporters : avant le match, chacun prédit le vainqueur.
// Après le coup d'envoi, les pourcentages restent visibles en lecture seule.
export function PredictionCard({ match }: { match: Match }) {
  const { session } = useAuth();
  const preds = useFetch(() => listPredictions(match.id), [match.id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const votes = preds.data ?? [];
  const home = votes.filter((v) => v.team_id === match.home_team_id).length;
  const away = votes.filter((v) => v.team_id === match.away_team_id).length;
  const total = home + away;
  const mine = votes.find((v) => v.user_id === session?.user.id)?.team_id ?? null;
  const open = match.status === 'scheduled';

  // Rien à montrer : match commencé sans aucun pronostic enregistré.
  if (!open && total === 0) return null;

  async function pick(teamId: string) {
    if (!open || busy) return;
    if (!session) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await votePrediction(match.id, session.user.id, teamId);
      await preds.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const pctHome = total > 0 ? Math.round((100 * home) / total) : 50;
  const pctAway = total > 0 ? 100 - pctHome : 50;

  const teamBtn = (team: Match['home_team'], teamId: string, pct: number) => {
    const selected = mine === teamId;
    return (
      <Pressable
        onPress={() => pick(teamId)}
        disabled={!open}
        style={({ pressed }) => [
          {
            flex: 1,
            alignItems: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: R.md,
            borderWidth: 1,
            borderColor: selected ? C.accent : C.border,
            backgroundColor: selected ? C.accentSoft : C.surface2,
          },
          pressed && open && { opacity: 0.8 },
        ]}>
        <Crest label={teamShort(team)} color={team?.color ?? C.surface} size={30} image={team?.logo_url} />
        <Text style={{ color: selected ? C.accent : C.text, fontSize: 12, fontWeight: '600' }}>
          {teamShort(team)}
        </Text>
        <Text style={{ color: selected ? C.accent : C.muted, fontSize: 15, fontWeight: '700' }}>{pct}%</Text>
      </Pressable>
    );
  };

  return (
    <Card>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 10 }}>
        {open ? 'Pronostic des supporters — qui va gagner ?' : 'Pronostic des supporters'}
      </Text>
      <Row style={{ gap: 10 }}>
        {teamBtn(match.home_team, match.home_team_id, pctHome)}
        {teamBtn(match.away_team, match.away_team_id, pctAway)}
      </Row>
      {total > 0 && (
        <View
          style={{
            flexDirection: 'row',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: 10,
            backgroundColor: C.surface2,
          }}>
          <View style={{ flex: Math.max(pctHome, 1), backgroundColor: C.accent }} />
          <View style={{ width: 2 }} />
          <View style={{ flex: Math.max(pctAway, 1), backgroundColor: C.flagYellow }} />
        </View>
      )}
      <Text style={{ color: C.dim, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
        {err
          ? `Erreur : ${err}`
          : total === 0
            ? open
              ? session
                ? 'Sois le premier à pronostiquer !'
                : 'Connecte-toi pour pronostiquer.'
              : ''
            : `${total} pronostic${total > 1 ? 's' : ''}${mine ? ' · ton choix est enregistré' : ''}`}
      </Text>
    </Card>
  );
}
