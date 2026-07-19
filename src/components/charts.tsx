import { Fragment, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { Circle, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';

import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';

// Graphiques SVG sobres, pensés pour le fond sombre de l'app. Ils se dessinent
// en pixels (pas de viewBox étiré) pour que les textes restent nets, et se
// mesurent via onLayout : l'appelant n'a jamais à fournir de largeur.

const GRID = 'rgba(255,255,255,0.08)';

/** Largeur réelle du conteneur. Rien n'est dessiné tant qu'elle est inconnue. */
function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    // Seuil anti-boucle : une différence infime de mesure ne doit pas
    // relancer un rendu à chaque frame.
    setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };
  return { width, onLayout };
}

function short(label: string, max = 9) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function EmptyChart({ height }: { height: number }) {
  const { t } = useT();
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.dim, fontSize: 12 }}>{t('Pas encore de données')}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Barres verticales avec la valeur au-dessus de chaque barre. */
export function BarChart({
  data,
  height = 140,
  suffix,
}: {
  data: BarDatum[];
  height?: number;
  suffix?: string;
}) {
  const { width, onLayout } = useMeasuredWidth();
  const topPad = 18;
  const labelPad = 18;

  return (
    <View onLayout={onLayout}>
      {data.length === 0 ? (
        <EmptyChart height={height} />
      ) : width > 0 ? (
        <Svg width={width} height={height + topPad + labelPad}>
          {(() => {
            const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
            const step = width / data.length;
            const barW = Math.min(step - 10, 46);
            const baseY = topPad + height;
            return (
              <>
                <Line x1={0} y1={baseY} x2={width} y2={baseY} stroke={GRID} strokeWidth={1} />
                {data.map((d, i) => {
                  const h = Math.max(2, (Math.abs(d.value) / max) * height);
                  const cx = i * step + step / 2;
                  return (
                    <Rect
                      key={`b${i}`}
                      x={cx - barW / 2}
                      y={baseY - h}
                      width={barW}
                      height={h}
                      rx={4}
                      fill={d.color ?? C.accent}
                      opacity={0.9}
                    />
                  );
                })}
                {data.map((d, i) => {
                  const h = Math.max(2, (Math.abs(d.value) / max) * height);
                  const cx = i * step + step / 2;
                  return (
                    <SvgText
                      key={`v${i}`}
                      x={cx}
                      y={baseY - h - 6}
                      fill={C.text}
                      fontSize={11}
                      fontWeight="600"
                      textAnchor="middle">
                      {`${d.value}${suffix ?? ''}`}
                    </SvgText>
                  );
                })}
                {data.map((d, i) => (
                  <SvgText
                    key={`l${i}`}
                    x={i * step + step / 2}
                    y={baseY + 13}
                    fill={C.dim}
                    fontSize={10}
                    textAnchor="middle">
                    {short(d.label)}
                  </SvgText>
                ))}
              </>
            );
          })()}
        </Svg>
      ) : (
        <View style={{ height: height + topPad + labelPad }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface LinePoint {
  label: string;
  value: number;
}

/** Courbe avec points, grille légère et moyenne optionnelle en pointillés. */
export function LineChart({
  data,
  height = 150,
  average,
  color = C.accent,
}: {
  data: LinePoint[];
  height?: number;
  average?: number;
  color?: string;
}) {
  const { width, onLayout } = useMeasuredWidth();
  const padL = 26;
  const padR = 10;
  const padT = 12;
  const padB = 20;

  return (
    <View onLayout={onLayout}>
      {data.length === 0 ? (
        <EmptyChart height={height} />
      ) : width > 0 ? (
        <Svg width={width} height={height}>
          {(() => {
            const plotW = Math.max(1, width - padL - padR);
            const plotH = Math.max(1, height - padT - padB);
            const rawMax = Math.max(...data.map((d) => d.value), average ?? 0);
            const max = Math.max(1, Math.ceil(rawMax * 1.15));
            const n = data.length;
            const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
            const yAt = (v: number) => padT + plotH - (v / max) * plotH;
            // Au-delà de 6 matchs, une étiquette sur deux (ou plus) suffit :
            // les noms d'adversaires se chevaucheraient.
            const every = Math.ceil(n / 6);
            const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.value)}`).join(' ');

            return (
              <>
                {[0, 0.5, 1].map((f) => (
                  <Fragment key={`g${f}`}>
                    <Line
                      x1={padL}
                      y1={padT + plotH * f}
                      x2={width - padR}
                      y2={padT + plotH * f}
                      stroke={GRID}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={padL - 5}
                      y={padT + plotH * f + 3.5}
                      fill={C.dim}
                      fontSize={9}
                      textAnchor="end">
                      {String(Math.round(max * (1 - f)))}
                    </SvgText>
                  </Fragment>
                ))}

                {average != null ? (
                  <>
                    <Line
                      x1={padL}
                      y1={yAt(average)}
                      x2={width - padR}
                      y2={yAt(average)}
                      stroke={C.muted}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    <SvgText
                      x={width - padR}
                      y={yAt(average) - 4}
                      fill={C.muted}
                      fontSize={9}
                      textAnchor="end">
                      {average.toFixed(1)}
                    </SvgText>
                  </>
                ) : null}

                <Path d={line} fill="none" stroke={color} strokeWidth={2} />

                {data.map((d, i) => (
                  <Circle
                    key={`p${i}`}
                    cx={xAt(i)}
                    cy={yAt(d.value)}
                    r={3.2}
                    fill={color}
                    stroke={C.bg}
                    strokeWidth={1.5}
                  />
                ))}

                {data.map((d, i) =>
                  i % every === 0 || i === n - 1 ? (
                    <SvgText
                      key={`x${i}`}
                      x={xAt(i)}
                      y={height - 5}
                      fill={C.dim}
                      fontSize={9}
                      textAnchor="middle">
                      {short(d.label, 7)}
                    </SvgText>
                  ) : null,
                )}
              </>
            );
          })()}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

/** Barres de comparaison face à face : chaque ligne partage la largeur entre A et B. */
export function StatBars({
  a,
  b,
  labels,
  aLabel,
  bLabel,
  aColor = C.accent,
  bColor = C.teal,
}: {
  a: number[];
  b: number[];
  labels: string[];
  aLabel?: string;
  bLabel?: string;
  aColor?: string;
  bColor?: string;
}) {
  const { width, onLayout } = useMeasuredWidth();
  const rowH = 40;
  const headH = aLabel || bLabel ? 18 : 0;
  const total = headH + labels.length * rowH;

  return (
    <View onLayout={onLayout}>
      {labels.length === 0 ? (
        <EmptyChart height={80} />
      ) : width > 0 ? (
        <Svg width={width} height={total}>
          {headH ? (
            <>
              <SvgText x={0} y={11} fill={aColor} fontSize={11} fontWeight="600">
                {aLabel ?? ''}
              </SvgText>
              <SvgText x={width} y={11} fill={bColor} fontSize={11} fontWeight="600" textAnchor="end">
                {bLabel ?? ''}
              </SvgText>
            </>
          ) : null}
          {labels.map((label, i) => {
            const va = a[i] ?? 0;
            const vb = b[i] ?? 0;
            const sum = Math.abs(va) + Math.abs(vb);
            const half = width / 2 - 2;
            // À égalité (ou sans données) chacun occupe la moitié : la barre
            // reste lisible et ne saute pas d'un côté.
            const fa = sum === 0 ? 0.5 : Math.abs(va) / sum;
            const top = headH + i * rowH;
            const barY = top + 22;
            return (
              <Fragment key={`r${i}`}>
                <SvgText x={0} y={top + 12} fill={C.text} fontSize={12} fontWeight="600">
                  {String(va)}
                </SvgText>
                <SvgText x={width / 2} y={top + 12} fill={C.dim} fontSize={11} textAnchor="middle">
                  {label}
                </SvgText>
                <SvgText x={width} y={top + 12} fill={C.text} fontSize={12} fontWeight="600" textAnchor="end">
                  {String(vb)}
                </SvgText>
                <Rect x={0} y={barY} width={width} height={6} rx={3} fill="rgba(255,255,255,0.06)" />
                <Rect
                  x={width / 2 - 2 - half * fa}
                  y={barY}
                  width={half * fa}
                  height={6}
                  rx={3}
                  fill={aColor}
                />
                <Rect x={width / 2 + 2} y={barY} width={half * (1 - fa)} height={6} rx={3} fill={bColor} />
              </Fragment>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: total }} />
      )}
    </View>
  );
}
