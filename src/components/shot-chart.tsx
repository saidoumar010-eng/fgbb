import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { Ellipse } from 'react-native-svg';

import { ChipSelect, type Option } from '@/components/chip-select';
import { COURT, Court, courtHeight, dotRadii, strokeUnits } from '@/components/court';
import { Card, Row } from '@/components/ui';
import { getMatch } from '@/lib/db';
import { listShots, listShotsByPlayer, shotZoneSummary } from '@/lib/db-shots';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { Match, Shot } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Carte des tirs publique : le demi-terrain, un point par tir, puis la
// réussite par zone. Le composant s'insère dans la page d'un match, il reste
// donc discret tant qu'aucun tir n'a été saisi.

const ALL = 'all';

async function loadChart(matchId?: string, playerId?: string) {
  if (matchId) {
    // Le match sert uniquement à nommer les deux équipes du filtre : les tirs
    // ne portent qu'un team_id.
    const [match, shots] = await Promise.all([getMatch(matchId), listShots(matchId)]);
    return { match: match as Match | null, shots };
  }
  if (playerId) return { match: null, shots: await listShotsByPlayer(playerId) };
  return { match: null, shots: [] as Shot[] };
}

export function ShotChart({ matchId, playerId }: { matchId?: string; playerId?: string }) {
  const { t } = useT();
  const { data, loading, error } = useFetch(() => loadChart(matchId, playerId), [matchId, playerId]);
  const [team, setTeam] = useState<string>(ALL);
  const [player, setPlayer] = useState<string>(playerId ?? ALL);
  const [width, setWidth] = useState(0);

  // Le composant peut être remonté avec un autre joueur (page joueur) sans
  // être démonté : le filtre doit suivre la prop.
  useEffect(() => {
    setTeam(ALL);
    setPlayer(playerId ?? ALL);
  }, [playerId]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    // Seuil anti-boucle : une mesure qui varie d'un pixel ne doit pas
    // relancer un rendu à chaque frame.
    setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const shots = data?.shots ?? [];
  const match = data?.match ?? null;

  if (loading && !data) return <Note text={t('Chargement…')} />;
  if (error) return <Note text={t('Carte des tirs indisponible.')} />;
  if (shots.length === 0) {
    return <Note icon="basketball-outline" text={t('Aucun tir saisi pour ce match.')} />;
  }

  const byTeam = team === ALL ? shots : shots.filter((s) => s.team_id === team);
  const shown = player === ALL ? byTeam : byTeam.filter((s) => s.player?.id === player);

  const teamOptions: Option[] = match
    ? [
        { id: ALL, label: t('Les deux') },
        { id: match.home_team_id, label: teamShort(match.home_team) },
        { id: match.away_team_id, label: teamShort(match.away_team) },
      ]
    : [];

  // Seuls les joueurs qui ont réellement tiré méritent une puce.
  const seen = new Map<string, string>();
  byTeam.forEach((s) => {
    if (s.player?.id) seen.set(s.player.id, playerLabel(s));
  });
  const playerOptions: Option[] = [
    { id: ALL, label: t('Tous') },
    ...[...seen.entries()].map(([id, label]) => ({ id, label })),
  ];

  const zones = shotZoneSummary(shown).filter((z) => z.att > 0);
  const made = shown.filter((s) => s.made).length;
  const pct = shown.length === 0 ? 0 : Math.round((made / shown.length) * 100);

  return (
    <Card>
      {teamOptions.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <ChipSelect
            options={teamOptions}
            value={team}
            onChange={(id) => {
              setTeam(id);
              // Le joueur sélectionné n'appartient plus forcément au filtre.
              setPlayer(ALL);
            }}
          />
        </View>
      ) : null}

      {playerOptions.length > 2 ? (
        <View style={{ marginBottom: 10 }}>
          <ChipSelect options={playerOptions} value={player} onChange={setPlayer} />
        </View>
      ) : null}

      <View onLayout={onLayout}>
        {width > 0 ? (
          <View style={{ width, height: courtHeight(width) }}>
            <Court width={width}>
              {shown.map((s) => (
                <ShotDot key={s.id} shot={s} width={width} />
              ))}
            </Court>
          </View>
        ) : (
          // Réserve la place du terrain dès la première frame : pas de saut.
          <View style={{ width: '100%', aspectRatio: 1 / COURT.ratio }} />
        )}
      </View>

      <Row style={{ gap: 16, marginTop: 10 }}>
        <Legend made label={t('Réussi')} />
        <Legend label={t('Manqué')} />
        <Text style={{ color: C.dim, fontSize: 11.5, marginLeft: 'auto' }}>
          {t('{made}/{att} · {pct}%', { made, att: shown.length, pct })}
        </Text>
      </Row>

      {zones.length > 0 ? (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 }}>
          {zones.map((z) => (
            <Row key={z.zone} style={{ gap: 10, paddingVertical: 6 }}>
              <Text style={{ color: C.muted, fontSize: 12.5, width: 96 }} numberOfLines={1}>
                {t(z.label)}
              </Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <View
                  style={{
                    width: `${z.pct}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: pctColor(z.pct),
                  }}
                />
              </View>
              <Text
                style={{ color: C.text, fontSize: 12.5, fontWeight: '600', width: 38, textAlign: 'right' }}>
                {`${z.pct}%`}
              </Text>
              <Text style={{ color: C.dim, fontSize: 11.5, width: 40, textAlign: 'right' }}>
                {`${z.made}/${z.att}`}
              </Text>
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Pastille d'un tir, dessinée dans le repère 0–100 du terrain (aucune conversion). */
function ShotDot({ shot, width }: { shot: Shot; width: number }) {
  const { rx, ry } = dotRadii(4.2, width);
  if (shot.made) {
    return <Ellipse cx={shot.x} cy={shot.y} rx={rx} ry={ry} fill={C.accent} opacity={0.92} />;
  }
  return (
    <Ellipse
      cx={shot.x}
      cy={shot.y}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={C.red}
      strokeWidth={strokeUnits(1.6, width)}
    />
  );
}

function Legend({ made, label }: { made?: boolean; label: string }) {
  return (
    <Row style={{ gap: 6 }}>
      <View
        style={{
          width: 9,
          height: 9,
          borderRadius: 4.5,
          backgroundColor: made ? C.accent : 'transparent',
          borderWidth: made ? 0 : 1.5,
          borderColor: C.red,
        }}
      />
      <Text style={{ color: C.dim, fontSize: 11.5 }}>{label}</Text>
    </Row>
  );
}

/** Message court, à la place du terrain : le composant ne laisse pas de trou. */
function Note({ icon, text }: { icon?: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <Card>
      <Row style={{ gap: 8 }}>
        {icon ? <Ionicons name={icon} size={15} color={C.dim} /> : null}
        <Text style={{ color: C.dim, fontSize: 12.5 }}>{text}</Text>
      </Row>
    </Card>
  );
}

function playerLabel(s: Shot) {
  const n = s.player?.number;
  return `${n != null ? `#${n} ` : ''}${s.player?.full_name ?? ''}`.trim();
}

// Seuils usuels du basket : au-dessus de 50 % c'est bon, en dessous de 33 %
// c'est faible.
function pctColor(pct: number) {
  if (pct >= 50) return C.green;
  if (pct >= 33) return C.flagYellow;
  return C.red;
}
