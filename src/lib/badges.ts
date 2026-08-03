import type { Ionicons } from '@expo/vector-icons';

import type { FanStats } from '@/lib/types';

// Badges du supporter : purement dérivés des statistiques déjà calculées par la
// fonction SQL my_fan_stats() (aucune table, aucune migration). L'assiduité
// récompense le fait de jouer régulièrement, la précision les pronostics gagnés.
// Chaque badge porte un seuil : on affiche aussi la progression vers le prochain.

export interface BadgeDef {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string; // texte français (clé de traduction)
  description: string;
  color: string; // teinte de la pastille une fois débloqué
  // Valeur atteinte et seuil à franchir : sert au libellé de progression.
  value: (s: FanStats) => number;
  goal: number;
}

// Teintes reprises du thème (drapeau + accents) sans importer le thème ici :
// badges.ts est de la logique pure, il ne dépend d'aucun rendu.
const GOLD = '#FCD116';
const GREEN = '#2BC48A';
const ACCENT = '#3BD61B';
const RED = '#CE1126';
const BLUE = '#4D9BE6';

export const BADGES: BadgeDef[] = [
  {
    id: 'first_step',
    icon: 'footsteps-outline',
    label: 'Premier pas',
    description: 'Jouer son premier pronostic',
    color: ACCENT,
    value: (s) => s.predictions,
    goal: 1,
  },
  {
    id: 'regular',
    icon: 'calendar-outline',
    label: 'Supporter assidu',
    description: 'Jouer 10 pronostics',
    color: GREEN,
    value: (s) => s.predictions,
    goal: 10,
  },
  {
    id: 'faithful',
    icon: 'flame-outline',
    label: 'Fidèle du championnat',
    description: 'Jouer 25 pronostics',
    color: RED,
    value: (s) => s.predictions,
    goal: 25,
  },
  {
    id: 'sharp_eye',
    icon: 'eye-outline',
    label: 'Œil de lynx',
    description: 'Gagner 5 pronostics',
    color: GREEN,
    value: (s) => s.correct,
    goal: 5,
  },
  {
    id: 'oracle',
    icon: 'sparkles-outline',
    label: 'Oracle du basket',
    description: 'Gagner 15 pronostics',
    color: GOLD,
    value: (s) => s.correct,
    goal: 15,
  },
  {
    id: 'quiz_master',
    icon: 'school-outline',
    label: 'Cerveau du basket',
    description: 'Marquer 10 points de quiz',
    color: BLUE,
    value: (s) => s.quiz_points,
    goal: 10,
  },
  {
    id: 'mvp_voter',
    icon: 'star-outline',
    label: 'Faiseur de MVP',
    description: 'Voter 5 fois pour le MVP',
    color: GOLD,
    value: (s) => s.mvp_votes,
    goal: 5,
  },
  {
    id: 'centurion',
    icon: 'ribbon-outline',
    label: 'Centurion',
    description: 'Atteindre 100 points',
    color: ACCENT,
    value: (s) => s.points,
    goal: 100,
  },
  {
    id: 'podium',
    icon: 'trophy-outline',
    label: 'Sur le podium',
    description: 'Entrer dans le top 3 du classement',
    color: GOLD,
    // position_no vaut 0 tant que le supporter n'est pas classé : on ne le
    // compte comme « sur le podium » que s'il a marqué des points.
    value: (s) => (s.points > 0 && s.position_no >= 1 && s.position_no <= 3 ? 1 : 0),
    goal: 1,
  },
];

export interface EarnedBadge {
  def: BadgeDef;
  earned: boolean;
  value: number;
}

export function computeBadges(stats: FanStats | null): EarnedBadge[] {
  const s: FanStats = stats ?? {
    points: 0,
    predictions: 0,
    correct: 0,
    quiz_points: 0,
    mvp_votes: 0,
    position_no: 0,
  };
  return BADGES.map((def) => {
    const value = def.value(s);
    return { def, earned: value >= def.goal, value };
  });
}

export function earnedCount(badges: EarnedBadge[]) {
  return badges.filter((b) => b.earned).length;
}
