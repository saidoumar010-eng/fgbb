import { Text, View } from 'react-native';

import { Row } from '@/components/ui';
import { BONUS_FOULS, formatClock, timeoutsAllowed, useGameClock, type ClockState } from '@/lib/game-clock';
import { useT } from '@/lib/i18n';
import { C, R } from '@/lib/theme';

/**
 * Bandeau de table de marque affiché aux supporters pendant un match.
 *
 * Le chrono n'est pas relu du serveur chaque seconde : la base porte l'instant
 * de la dernière décision et le téléphone en déduit la seconde courante
 * (cf. lib/game-clock.ts). Un supporter qui ouvre la page en plein
 * quart-temps voit donc le bon temps, sans que la table ait rien à écrire.
 */
export function LiveScoreboard({
  clock,
  quarter,
  homeName,
  awayName,
  homeFouls,
  awayFouls,
  homeTimeouts,
  awayTimeouts,
}: {
  clock: ClockState;
  quarter: number | null;
  homeName: string;
  awayName: string;
  homeFouls: number;
  awayFouls: number;
  homeTimeouts: number;
  awayTimeouts: number;
}) {
  const { t } = useT();
  const seconds = useGameClock(clock);
  const allowed = timeoutsAllowed(quarter);

  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: C.border,
        paddingVertical: 11,
        paddingHorizontal: 13,
        marginTop: 10,
      }}>
      <Row style={{ justifyContent: 'center', gap: 9, alignItems: 'baseline' }}>
        <Text
          style={{
            color: clock.clock_running ? C.red : C.text,
            fontSize: 30,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}>
          {formatClock(seconds)}
        </Text>
        <Text style={{ color: C.dim, fontSize: 12 }}>
          {!clock.clock_running ? t('chrono arrêté') : ''}
        </Text>
      </Row>

      <Row style={{ marginTop: 10, gap: 10 }}>
        <TeamStrip
          name={homeName}
          fouls={homeFouls}
          timeouts={homeTimeouts}
          allowed={allowed}
        />
        <View style={{ width: 1, backgroundColor: C.border, alignSelf: 'stretch' }} />
        <TeamStrip
          name={awayName}
          fouls={awayFouls}
          timeouts={awayTimeouts}
          allowed={allowed}
        />
      </Row>
    </View>
  );
}

function TeamStrip({
  name,
  fouls,
  timeouts,
  allowed,
}: {
  name: string;
  fouls: number;
  timeouts: number;
  allowed: number;
}) {
  const { t } = useT();
  const bonus = fouls >= BONUS_FOULS;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={{ color: C.muted, fontSize: 11.5, fontWeight: '600' }}>{name}</Text>
      <Row style={{ gap: 4 }}>
        <Text style={{ color: bonus ? C.red : C.text, fontSize: 13, fontWeight: '600' }}>{fouls}</Text>
        <Text style={{ color: C.dim, fontSize: 11 }}>{t('fautes')}</Text>
        {bonus ? (
          <Text style={{ color: C.red, fontSize: 9.5, fontWeight: '700', marginLeft: 2 }}>{t('BONUS')}</Text>
        ) : null}
      </Row>
      {/* Temps morts restants : ce que le public cherche en fin de match serré. */}
      <Row style={{ gap: 3, marginTop: 1 }}>
        {Array.from({ length: allowed }, (_, i) => (
          <View
            key={i}
            style={{
              width: 13,
              height: 5,
              borderRadius: 3,
              backgroundColor: i < allowed - timeouts ? C.accent : 'rgba(255,255,255,0.14)',
            }}
          />
        ))}
      </Row>
    </View>
  );
}
