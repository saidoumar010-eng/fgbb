// Thème FGBB — inspiré de l'affiche D1 : accent vert vif, touches du drapeau
// guinéen. Deux palettes (sombre « vert canard » par défaut, et clair) qui
// partagent exactement les mêmes clés. Le supporter bascule depuis son compte.
//
// Mise en œuvre : `C` est un objet MUTÉ sur place au changement de thème
// (applyPalette), et l'arbre est remonté par le ThemeProvider (clé) pour que
// les 100+ écrans qui lisent `C.*` en rendu reprennent les nouvelles valeurs.
// Les rares styles figés au chargement (ui.tsx) sont reconstruits par
// refreshThemedStyles(). Voir src/lib/theme-context.tsx.

export type ThemeMode = 'dark' | 'light';

const DARK = {
  bg: '#06201C',
  surface: '#0B2E29',
  surface2: '#12403A',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  text: '#F2F7F5',
  muted: '#92ACA5',
  dim: '#7C968F',

  // vert vif de l'affiche D1 (boutons, éléments actifs)
  accent: '#3BD61B',
  accentSoft: 'rgba(59,214,27,0.15)',
  accentText: '#06230A',

  // vert canard moyen (grands blocs, carte « à la une »)
  teal: '#0E5F58',
  tealDeep: '#0A4A44',

  inputBg: '#09271F',
  tabBar: '#08221E',
  tabBarInactive: '#6F8B84',

  // pastille de filtre inactive, rail d'interrupteur éteint, icône de
  // remplacement d'image : des valeurs bleu-gris traînaient dans une dizaine
  // d'écrans depuis le passage au vert canard, elles vivent ici désormais.
  chipBg: '#0F332D',
  switchTrack: '#173F38',
  placeholderIcon: '#3E6B62',

  red: '#E23B3B', // live
  redSoft: 'rgba(226,59,59,0.16)',
  green: '#2BC48A', // victoires / succès
  greenSoft: 'rgba(43,196,138,0.16)',
  greenText: '#04241A',

  // couleurs du drapeau pour le logo / accents
  flagRed: '#CE1126',
  flagYellow: '#FCD116',
  flagGreen: '#009460',
};

export type Palette = Record<keyof typeof DARK, string>;

// Palette claire : surfaces blanches, texte teal foncé. L'accent passe à un
// vert plus soutenu (le vert vif D1 est illisible en texte sur blanc) et le
// texte des boutons devient blanc. Teal, drapeau et rouge/vert sémantiques
// restent proches pour garder l'identité visuelle d'un écran à l'autre.
const LIGHT: Palette = {
  bg: '#EEF3F0',
  surface: '#FFFFFF',
  surface2: '#E2EAE6',
  border: 'rgba(6,32,28,0.10)',
  borderStrong: 'rgba(6,32,28,0.20)',

  text: '#08231E',
  muted: '#42584F',
  dim: '#6A7F77',

  accent: '#0F8A3C',
  accentSoft: 'rgba(15,138,60,0.14)',
  accentText: '#FFFFFF',

  teal: '#0E5F58',
  tealDeep: '#0A4A44',

  inputBg: '#F1F5F3',
  tabBar: '#FFFFFF',
  tabBarInactive: '#7C938B',

  chipBg: '#E8EFEB',
  switchTrack: '#CBD8D2',
  placeholderIcon: '#9DB2AA',

  red: '#D12F2F',
  redSoft: 'rgba(209,47,47,0.12)',
  green: '#159C6E',
  greenSoft: 'rgba(21,156,110,0.14)',
  greenText: '#04241A',

  flagRed: '#CE1126',
  flagYellow: '#FCD116',
  flagGreen: '#009460',
};

// Objet vivant lu par toute l'application. Muté sur place — on ne le réassigne
// jamais, sinon les imports `import { C }` ne verraient pas le changement.
export const C: Palette = { ...DARK };

let currentMode: ThemeMode = 'dark';

export function activeMode() {
  return currentMode;
}

export function applyPalette(mode: ThemeMode) {
  currentMode = mode;
  Object.assign(C, mode === 'light' ? LIGHT : DARK);
}

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Couleurs de pastille proposées pour les clubs (espace admin)
export const TEAM_COLORS = ['#1C3F8F', '#9A2A2A', '#0F7A4D', '#B5891F', '#6A3FA0', '#1F7A8C'];

export const POSITIONS = ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'];
