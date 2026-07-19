import { EN_CLUB } from '@/lib/locales/en-club';
import { EN_COMMUNITY } from '@/lib/locales/en-community';
import { EN_CONTENT } from '@/lib/locales/en-content';
import { EN_CORE } from '@/lib/locales/en-core';
import { EN_FAN } from '@/lib/locales/en-fan';
import { EN_FEDERATION } from '@/lib/locales/en-federation';
import { EN_OFFICIALS } from '@/lib/locales/en-officials';
import { EN_SHOTS } from '@/lib/locales/en-shots';
import { EN_STATS } from '@/lib/locales/en-stats';

// Dictionnaire anglais : la clé est le texte français exact affiché dans l'app.
// Découpé par domaine pour rester lisible au fil des ajouts de fonctionnalités.
export const EN: Record<string, string> = {
  ...EN_CORE,
  ...EN_FEDERATION,
  ...EN_OFFICIALS,
  ...EN_COMMUNITY,
  ...EN_FAN,
  ...EN_SHOTS,
  ...EN_STATS,
  ...EN_CONTENT,
  ...EN_CLUB,
};
