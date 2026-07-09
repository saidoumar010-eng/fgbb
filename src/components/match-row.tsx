import { Pressable, Text, View } from 'react-native';

import { Card, Crest, Pill, Row } from '@/components/ui';
import { matchWhen, teamShort } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Match } from '@/lib/types';

export function MatchRow({ match, onPress }: { match: Match; onPress?: () => void }) {
  const scheduled = match.status === 'scheduled';
  const live = match.status === 'live';
  const finished = match.status === 'finished';
  const homeWin = finished && match.home_score > match.away_score;
  const awayWin = finished && match.away_score > match.home_score;
  const { day, time } = matchWhen(match.scheduled_at);

  const teamLine = (team: Match['home_team'], score: number, dimmed: boolean) => (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
      <Row style={{ gap: 8, flex: 1 }}>
        <Crest label={teamShort(team)} color={team?.color ?? C.surface2} size={20} image={team?.logo_url} />
        <Text style={{ color: dimmed ? C.dim : C.text, fontSize: 13 }} numberOfLines={1}>
          {team?.name ?? 'Équipe'}
        </Text>
      </Row>
      {!scheduled && (
        <Text style={{ color: dimmed ? C.dim : C.text, fontSize: 14, fontWeight: '600' }}>
          {score}
        </Text>
      )}
    </Row>
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Card style={{ padding: 0 }}>
        <Row style={{ padding: 11, gap: 12 }}>
          {scheduled && (
            <View style={{ width: 52, alignItems: 'center' }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{time}</Text>
              <Text style={{ color: C.dim, fontSize: 11 }}>{day}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            {teamLine(match.home_team, match.home_score, awayWin)}
            {teamLine(match.away_team, match.away_score, homeWin)}
          </View>
          <View style={{ alignItems: 'center', minWidth: 44 }}>
            {live && <Pill label="LIVE" tone="red" dot />}
            {finished && <Pill label="Fini" tone="neutral" />}
            {scheduled && <Ionicon />}
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}

function Ionicon() {
  // petit indicateur "rappel" pour les matchs à venir
  return <Text style={{ color: C.dim, fontSize: 18 }}>›</Text>;
}
