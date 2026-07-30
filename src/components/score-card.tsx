import { forwardRef } from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { fullDate, teamShort } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Match } from '@/lib/types';

/**
 * Visuel de résultat partageable.
 *
 * En Guinée les scores circulent sur WhatsApp et Facebook : une carte aux
 * couleurs de la fédération se transfère et se reconnaît, là où un message
 * texte se perd. Le carré 1080 est le format que ces applications recadrent
 * le moins.
 *
 * Dessiné en SVG et non en vues React Native : c'est ce qui permet de le
 * rasteriser à l'identique sur les deux plateformes (cf. lib/share-card.ts).
 * Aucune image externe n'y entre — une ressource distante « souillerait » le
 * canvas du navigateur et empêcherait l'export PNG.
 */

export const CARD_SIZE = 1080;

// Palette figée : la carte sort de l'application, elle ne doit pas dépendre
// du thème de l'appareil ni d'un futur changement d'accent.
const BG = C.tealDeep;
const BG_TOP = C.teal;
const ACCENT = C.accent;
const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.72)';

function initials(name?: string | null) {
  return (name ?? '').trim().slice(0, 3).toUpperCase();
}

/** Réduit un nom trop long pour tenir sous le blason sans déborder. */
function fit(name: string | undefined, max = 18) {
  const n = (name ?? '').trim();
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

export interface ScoreCardProps {
  match: Match;
  homeScore: number;
  awayScore: number;
  /** Taille de rendu à l'écran. Le dessin reste en 1080 via le viewBox. */
  size?: number;
  live?: boolean;
}

export const ScoreCard = forwardRef<Svg, ScoreCardProps>(function ScoreCard(
  { match: m, homeScore, awayScore, size = CARD_SIZE, live = false },
  ref,
) {
  const scheduled = m.status === 'scheduled';
  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;

  return (
    <Svg ref={ref} width={size} height={size} viewBox={`0 0 ${CARD_SIZE} ${CARD_SIZE}`}>
      <Rect x={0} y={0} width={CARD_SIZE} height={CARD_SIZE} fill={BG} />
      <Rect x={0} y={0} width={CARD_SIZE} height={620} fill={BG_TOP} />

      {/* Ballon fantôme, repris des affiches D1 de la fédération. */}
      <G opacity={0.07}>
        <Circle cx={905} cy={175} r={210} fill={WHITE} />
        <Path d="M695 175 H1115 M905 -35 V385" stroke={BG_TOP} strokeWidth={14} />
      </G>

      <SvgText x={64} y={104} fill={ACCENT} fontSize={34} fontWeight="bold" letterSpacing={6}>
        FGBB
      </SvgText>
      <SvgText x={64} y={152} fill={SOFT} fontSize={26} letterSpacing={2}>
        {(m.competition?.name ?? 'Match').toUpperCase()}
      </SvgText>

      {live ? (
        <>
          <Circle cx={950} cy={96} r={13} fill={C.red} />
          <SvgText x={975} y={108} fill={C.red} fontSize={30} fontWeight="bold" letterSpacing={3}>
            DIRECT
          </SvgText>
        </>
      ) : null}

      {/* Blasons : pastille de la couleur du club, initiales au centre. */}
      <Blason cx={250} cy={400} color={m.home_team?.color ?? BG} label={teamShort(m.home_team) || initials(m.home_team?.name)} />
      <Blason cx={830} cy={400} color={m.away_team?.color ?? BG} label={teamShort(m.away_team) || initials(m.away_team?.name)} />

      <SvgText x={250} y={580} fill={WHITE} fontSize={40} fontWeight="bold" textAnchor="middle">
        {fit(m.home_team?.name)}
      </SvgText>
      <SvgText x={830} y={580} fill={WHITE} fontSize={40} fontWeight="bold" textAnchor="middle">
        {fit(m.away_team?.name)}
      </SvgText>

      {scheduled ? (
        <SvgText x={540} y={420} fill={ACCENT} fontSize={92} fontWeight="bold" textAnchor="middle">
          VS
        </SvgText>
      ) : (
        <>
          <SvgText
            x={470}
            y={430}
            fill={homeWin ? ACCENT : WHITE}
            fontSize={130}
            fontWeight="bold"
            textAnchor="end">
            {homeScore}
          </SvgText>
          <SvgText x={540} y={425} fill={SOFT} fontSize={72} textAnchor="middle">
            –
          </SvgText>
          <SvgText
            x={610}
            y={430}
            fill={awayWin ? ACCENT : WHITE}
            fontSize={130}
            fontWeight="bold"
            textAnchor="start">
            {awayScore}
          </SvgText>
        </>
      )}

      {/* Quart-temps : la lecture qu'un supporter cherche en premier après le score. */}
      {m.quarter_scores?.length ? (
        <Quarters match={m} />
      ) : null}

      <SvgText x={540} y={950} fill={SOFT} fontSize={30} textAnchor="middle">
        {[fullDate(m.scheduled_at), m.venue].filter(Boolean).join('  ·  ')}
      </SvgText>

      <Rect x={0} y={996} width={CARD_SIZE} height={84} fill={ACCENT} />
      <SvgText
        x={540}
        y={1050}
        fill={C.accentText}
        fontSize={30}
        fontWeight="bold"
        textAnchor="middle"
        letterSpacing={1}>
        Fédération Guinéenne de Basketball
      </SvgText>
    </Svg>
  );
});

function Blason({ cx, cy, color, label }: { cx: number; cy: number; color: string; label: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={96} fill={color} stroke="rgba(255,255,255,0.28)" strokeWidth={4} />
      <SvgText x={cx} y={cy + 24} fill={WHITE} fontSize={62} fontWeight="bold" textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

// Tableau des quarts-temps, centré, largeur adaptée au nombre de périodes
// (une prolongation ajoute une colonne).
function Quarters({ match: m }: { match: Match }) {
  const qs = m.quarter_scores ?? [];
  const col = 110;
  const total = qs.length * col;
  const startX = 540 - total / 2 + col / 2;
  return (
    <G>
      {qs.map((q, i) => {
        const x = startX + i * col;
        return (
          <G key={q.q}>
            <SvgText x={x} y={700} fill={SOFT} fontSize={26} textAnchor="middle">
              {`Q${q.q}`}
            </SvgText>
            <SvgText x={x} y={760} fill={WHITE} fontSize={36} fontWeight="bold" textAnchor="middle">
              {q.home}
            </SvgText>
            <SvgText x={x} y={820} fill={WHITE} fontSize={36} fontWeight="bold" textAnchor="middle">
              {q.away}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}
