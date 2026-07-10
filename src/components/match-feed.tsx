import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Card, Empty, Row } from '@/components/ui';
import { listMatchEvents } from '@/lib/db';
import { matchWhen, teamShort } from '@/lib/format';
import { useMatchEventsRealtime } from '@/lib/realtime';
import { C, S } from '@/lib/theme';
import type { Match, MatchEvent } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Fil du match (play-by-play) : chaque action saisie par la table de marque
// apparaît ici en temps réel, la plus récente en premier.
export function MatchFeed({ match }: { match: Match }) {
  const events = useFetch(() => listMatchEvents(match.id), [match.id]);
  useMatchEventsRealtime(match.id, () => events.reload());
  const list = events.data ?? [];

  if (list.length === 0) {
    return (
      <Empty
        icon="pulse-outline"
        title="Pas encore d'action"
        subtitle={
          match.status === 'scheduled'
            ? 'Le fil du match démarrera au coup d’envoi.'
            : 'Les actions saisies par la table de marque apparaîtront ici.'
        }
      />
    );
  }

  return (
    <View style={{ paddingHorizontal: S.lg, paddingTop: 12, gap: 8 }}>
      {list.map((ev) => (
        <EventRow key={ev.id} ev={ev} match={match} />
      ))}
    </View>
  );
}

function EventRow({ ev, match }: { ev: MatchEvent; match: Match }) {
  const isHome = ev.team_id === match.home_team_id;
  const team = isHome ? match.home_team : ev.team_id === match.away_team_id ? match.away_team : ev.team;
  const time = matchWhen(ev.created_at).time;

  let icon: keyof typeof Ionicons.glyphMap = 'basketball-outline';
  let color: string = C.accent;
  let title = '';
  let sub = team ? teamShort(team) : '';

  switch (ev.kind) {
    case 'points':
      title = `+${ev.points} ${ev.player?.full_name ?? teamShort(team)}`;
      sub = [team?.name, ev.quarter ? `Q${ev.quarter}` : null].filter(Boolean).join(' · ');
      break;
    case 'correction':
      icon = 'remove-circle-outline';
      color = C.muted;
      title = `Correction ${ev.points}`;
      sub = team?.name ?? '';
      break;
    case 'quarter':
      icon = 'time-outline';
      color = C.flagYellow;
      title =
        ev.quarter && ev.quarter > 4
          ? `Prolongation ${ev.quarter - 4}`
          : `Début du ${ev.quarter ?? '?'}e quart-temps`;
      sub = '';
      break;
    case 'info':
      icon = 'flag-outline';
      color = C.red;
      title = ev.label ?? 'Info';
      sub = '';
      break;
  }

  return (
    <Card style={{ paddingVertical: 10 }}>
      <Row style={{ gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: C.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: C.dim, fontSize: 11, fontVariant: ['tabular-nums'] }}>{time}</Text>
      </Row>
    </Card>
  );
}
