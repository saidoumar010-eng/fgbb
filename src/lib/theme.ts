// Thème sombre « premium » FGBB — accents dorés, couleurs de la Guinée.
export const C = {
  bg: '#0B0E13',
  surface: '#141922',
  surface2: '#1C2230',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',

  text: '#F4F6F9',
  muted: '#8A95A4',
  dim: '#7E8A99',

  gold: '#E8B23A',
  goldSoft: 'rgba(232,178,58,0.16)',
  goldText: '#1A1206',

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
