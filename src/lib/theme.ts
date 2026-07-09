// Thème sombre « vert canard » FGBB — inspiré de l'affiche D1 :
// fond teal profond, accent vert vif, touches du drapeau guinéen.
export const C = {
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

  red: '#E23B3B', // live
  redSoft: 'rgba(226,59,59,0.16)',
  green: '#2BC48A', // victoires / succès
  greenSoft: 'rgba(43,196,138,0.16)',
  greenText: '#04241A',

  // couleurs du drapeau pour le logo / accents
  flagRed: '#CE1126',
  flagYellow: '#FCD116',
  flagGreen: '#009460',
} as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Couleurs de pastille proposées pour les clubs (espace admin)
export const TEAM_COLORS = ['#1C3F8F', '#9A2A2A', '#0F7A4D', '#B5891F', '#6A3FA0', '#1F7A8C'];

export const POSITIONS = ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'];
