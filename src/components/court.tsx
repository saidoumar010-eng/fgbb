import type { ReactNode } from 'react';
import { Ellipse, Line, Path, Rect, Svg } from 'react-native-svg';

import { C } from '@/lib/theme';

// Repère normalisé partagé par la saisie admin et l'affichage public :
//   x = largeur du terrain (0 = ligne de touche gauche, 100 = ligne de touche droite)
//   y = profondeur         (0 = ligne de fond, 100 = milieu de terrain)
// Le panier est ancré à (50, 6), comme le prévoit le schéma SQL. Tout le
// dessin découle de ces constantes : c'est la seule garantie que le point
// touché par l'admin retombe exactement là où le tir sera affiché.

const WIDTH_M = 15; // largeur d'un demi-terrain FIBA
const DEPTH_M = 14; // ligne de fond → milieu de terrain
const THREE_M = 6.75; // rayon de la ligne à 3 points

// 1 % de largeur (0,15 m) ne vaut pas 1 % de profondeur (0,14 m) : le repère
// n'est pas isotrope, chaque conversion doit passer par le bon axe.
const ux = (m: number) => (m / WIDTH_M) * 100;
const uy = (m: number) => (m / DEPTH_M) * 100;

export const COURT = {
  basketX: 50,
  basketY: 6,
  /** Un demi-terrain est plus large que profond : hauteur = largeur × ratio. */
  ratio: DEPTH_M / WIDTH_M,
} as const;

// Distances relevées sur un terrain FIBA, exprimées dans le repère 0–100.
const GEO = {
  paintHalf: ux(2.45), // raquette : 4,90 m de large
  paintDepth: uy(5.8), // ligne de lancer franc à 5,80 m de la ligne de fond
  ftRx: ux(1.8),
  ftRy: uy(1.8),
  restrictedRx: ux(1.25), // zone de non-charge sous le panier
  restrictedRy: uy(1.25),
  threeRx: ux(THREE_M),
  threeRy: uy(THREE_M),
  cornerX: ux(0.9), // les lignes de corner passent à 0,90 m des touches
  // Hauteur à laquelle l'arc rejoint la ligne droite du corner.
  cornerY: COURT.basketY + uy(Math.sqrt(THREE_M ** 2 - (WIDTH_M / 2 - 0.9) ** 2)),
  hoopRx: ux(0.225),
  hoopRy: uy(0.225),
  boardHalf: ux(0.9), // planche : 1,80 m
  boardY: COURT.basketY - uy(0.375),
  centerRx: ux(1.8),
  centerRy: uy(1.8),
};

/** Hauteur en pixels du terrain pour une largeur donnée. */
export function courtHeight(width: number) {
  return width * COURT.ratio;
}

/** Coordonnées normalisées → pixels, dans le repère du composant `Court`. */
export function toPx(x: number, y: number, width: number) {
  return { px: (x / 100) * width, py: (y / 100) * courtHeight(width) };
}

/** Point touché (locationX / locationY) → coordonnées normalisées 0–100. */
export function toNorm(px: number, py: number, width: number, height?: number) {
  const h = height ?? courtHeight(width);
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));
  return { x: clamp((px / width) * 100), y: clamp((py / h) * 100) };
}

/** Distance réelle en mètres entre un point normalisé et le panier. */
export function distanceToBasket(x: number, y: number) {
  const dx = ((x - COURT.basketX) / 100) * WIDTH_M;
  const dy = ((y - COURT.basketY) / 100) * DEPTH_M;
  return Math.hypot(dx, dy);
}

/** Vrai si le point est dans la raquette. */
export function isPaint(x: number, y: number) {
  return (
    x >= COURT.basketX - GEO.paintHalf &&
    x <= COURT.basketX + GEO.paintHalf &&
    y <= GEO.paintDepth
  );
}

/**
 * Marge en mètres par rapport à la ligne à 3 points : positive derrière la
 * ligne, négative dans la zone à 2 points. Dans le couloir des corners, c'est
 * la ligne droite qui fait foi, ailleurs l'arc.
 */
export function threeMargin(x: number, y: number) {
  if (y <= GEO.cornerY) {
    const left = ((GEO.cornerX - x) / 100) * WIDTH_M;
    const right = ((x - (100 - GEO.cornerX)) / 100) * WIDTH_M;
    return Math.max(left, right);
  }
  return distanceToBasket(x, y) - THREE_M;
}

export function isBeyondArc(x: number, y: number) {
  return threeMargin(x, y) > 0;
}

/**
 * Type de tir suggéré par la géométrie. Renvoie `null` à moins de 40 cm de la
 * ligne : trop juste pour contredire l'admin, qui a vu l'action.
 */
export function suggestedPoints(x: number, y: number): 2 | 3 | null {
  const m = threeMargin(x, y);
  if (m > 0.4) return 3;
  if (m < -0.4) return 2;
  return null;
}

/**
 * Rayons d'une pastille ronde à l'écran, exprimés dans le repère du terrain.
 * Le viewBox étant étiré en hauteur, un cercle doit être dessiné en ellipse.
 */
export function dotRadii(radiusPx: number, width: number) {
  const rx = (radiusPx / width) * 100;
  return { rx, ry: rx / COURT.ratio };
}

/** Épaisseur de trait en unités du repère, pour un rendu constant en pixels. */
export function strokeUnits(px: number, width: number) {
  return (px / width) * 100;
}

const LINE = 'rgba(255,255,255,0.30)';

/**
 * Demi-terrain vu du dessus, panier en haut. Les enfants sont dessinés dans le
 * même repère 0–100 : l'appelant peut y superposer des tirs sans risque de
 * décalage.
 */
export function Court({ width, children }: { width: number; children?: ReactNode }) {
  if (width <= 0) return null;
  const height = courtHeight(width);
  const sw = strokeUnits(1.2, width);
  const bx = COURT.basketX;
  const by = COURT.basketY;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Rect x={0} y={0} width={100} height={100} rx={1.6} fill={C.surface} stroke={LINE} strokeWidth={sw} />

      {/* Raquette et cercle de lancer franc */}
      <Rect
        x={bx - GEO.paintHalf}
        y={0}
        width={GEO.paintHalf * 2}
        height={GEO.paintDepth}
        fill="rgba(255,255,255,0.05)"
        stroke={LINE}
        strokeWidth={sw}
      />
      <Ellipse
        cx={bx}
        cy={GEO.paintDepth}
        rx={GEO.ftRx}
        ry={GEO.ftRy}
        fill="none"
        stroke={LINE}
        strokeWidth={sw}
      />

      {/* Zone de non-charge */}
      <Path
        d={`M ${bx - GEO.restrictedRx} ${by} A ${GEO.restrictedRx} ${GEO.restrictedRy} 0 0 0 ${bx + GEO.restrictedRx} ${by}`}
        fill="none"
        stroke={LINE}
        strokeWidth={sw}
      />

      {/* Ligne à 3 points : deux corners droits puis l'arc */}
      <Line x1={GEO.cornerX} y1={0} x2={GEO.cornerX} y2={GEO.cornerY} stroke={LINE} strokeWidth={sw} />
      <Line
        x1={100 - GEO.cornerX}
        y1={0}
        x2={100 - GEO.cornerX}
        y2={GEO.cornerY}
        stroke={LINE}
        strokeWidth={sw}
      />
      <Path
        d={`M ${GEO.cornerX} ${GEO.cornerY} A ${GEO.threeRx} ${GEO.threeRy} 0 0 0 ${100 - GEO.cornerX} ${GEO.cornerY}`}
        fill="none"
        stroke={LINE}
        strokeWidth={sw}
      />

      {/* Rond central, coupé par la ligne médiane */}
      <Path
        d={`M ${bx - GEO.centerRx} 100 A ${GEO.centerRx} ${GEO.centerRy} 0 0 1 ${bx + GEO.centerRx} 100`}
        fill="none"
        stroke={LINE}
        strokeWidth={sw}
      />

      {/* Panier : planche, col et cercle */}
      <Line
        x1={bx - GEO.boardHalf}
        y1={GEO.boardY}
        x2={bx + GEO.boardHalf}
        y2={GEO.boardY}
        stroke={C.accent}
        strokeWidth={sw * 1.4}
        strokeLinecap="round"
      />
      <Line x1={bx} y1={GEO.boardY} x2={bx} y2={by} stroke={C.accent} strokeWidth={sw} />
      <Ellipse
        cx={bx}
        cy={by}
        rx={GEO.hoopRx}
        ry={GEO.hoopRy}
        fill="none"
        stroke={C.accent}
        strokeWidth={sw * 1.2}
      />

      {children}
    </Svg>
  );
}
