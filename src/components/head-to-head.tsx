import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { Card, Row } from '@/components/ui';
import { getHeadToHead } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Match } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Face-à-face : bilan des confrontations passées entre les deux équipes.
export function HeadToHead({ match }: { match: Match }) {
  const h2h = useFetch(() => getHeadToHead(match.home_team_id, match.away_team_id), [match.id]);
  const past = (h2h.data ?? []).filter((m) => m.id !== match.id);

  if (h2h.loading || h2h.error) {
    return (
      <Card>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          {h2h.error ? 'Historique indisponible pour le moment.' : 'Chargement du face-à-face…'}
        </Text>
      </Card>
    );
  }

  if (past.length === 0) {
    return (
      <Card>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          Première confrontation enregistrée entre ces deux équipes.
        </Text>
      </Card>
    );
  }

  let winsHome = 0;
  let winsAway = 0;
  for (const m of past) {
    // Un match nul ne compte de victoire pour personne (cohérent avec le classement).
    if (m.home_score === m.away_score) continue;
    const winner = m.home_score > m.away_score ? m.home_team_id : m.away_team_id;
    if (winner === match.home_team_id) winsHome += 1;
    else if (winner === match.away_team_id) winsAway += 1;
  }

  return (
    <View style={{ gap: 9 }}>
      <Card>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 10 }}>
          Face-à-face ({past.length} match{past.length > 1 ? 's' : ''})
        </Text>
        <Row style={{ justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 24, fontWeight: '700' }}>{winsHome}</Text>
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{teamShort(match.home_team)}</Text>
          </View>
          <Text style={{ color: C.dim, fontSize: 13, alignSelf: 'center' }}>victoires</Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 24, fontWeight: '700' }}>{winsAway}</Text>
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{teamShort(match.away_team)}</Text>
          </View>
        </Row>
      </Card>
      <View style={{ gap: 9, marginBottom: S.md }}>
        {past.slice(0, 5).map((m) => (
          <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
        ))}
      </View>
    </View>
  );
}
