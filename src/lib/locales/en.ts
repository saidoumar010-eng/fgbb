import { EN_CLUB } from '@/lib/locales/en-club';
import { EN_COMMUNITY } from '@/lib/locales/en-community';
import { EN_CONTENT } from '@/lib/locales/en-content';
import { EN_CORE } from '@/lib/locales/en-core';
import { EN_GAPS } from '@/lib/locales/en-gaps';
import { EN_FAN } from '@/lib/locales/en-fan';
import { EN_FEDERATION } from '@/lib/locales/en-federation';
import { EN_OFFICIALS } from '@/lib/locales/en-officials';
import { EN_OFFLINE } from '@/lib/locales/en-offline';
import { EN_SCORERS_TABLE } from '@/lib/locales/en-scorers-table';
import { EN_SHARE } from '@/lib/locales/en-share';
import { EN_SHOTS } from '@/lib/locales/en-shots';
import { EN_STATS } from '@/lib/locales/en-stats';
import { EN_SWEEP_ADMIN1 } from '@/lib/locales/en-sweep-admin1';
import { EN_SWEEP_ADMIN2 } from '@/lib/locales/en-sweep-admin2';
import { EN_SWEEP_COMPONENTS } from '@/lib/locales/en-sweep-components';
import { EN_SWEEP_DETAIL } from '@/lib/locales/en-sweep-detail';
import { EN_SWEEP_HOME } from '@/lib/locales/en-sweep-home';
import { EN_SWEEP_PUBLIC } from '@/lib/locales/en-sweep-public';

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
  ...EN_OFFLINE,
  ...EN_SHARE,
  ...EN_SCORERS_TABLE,
  ...EN_SWEEP_HOME,
  ...EN_SWEEP_DETAIL,
  ...EN_SWEEP_PUBLIC,
  ...EN_SWEEP_COMPONENTS,
  ...EN_SWEEP_ADMIN1,
  ...EN_SWEEP_ADMIN2,
  // En dernier : comble les textes qu'aucun domaine n'avait couverts.
  ...EN_GAPS,
};
