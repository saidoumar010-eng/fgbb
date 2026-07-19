import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EN } from '@/lib/locales/en';

// L'application est écrite en français : la clé de traduction EST le texte
// français. `t('Classement')` renvoie « Standings » en anglais, et retombe
// naturellement sur le français si la traduction manque — jamais d'écran vide.

export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'fgbb.lang';

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (fr: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'en' || v === 'fr') setLangState(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
      },
      t: (fr, vars) => interpolate(lang === 'en' ? (EN[fr] ?? fr) : fr, vars),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  // Hors provider (rendu isolé, tests), on retombe sur le français.
  if (!ctx) {
    return {
      lang: 'fr' as Lang,
      setLang: () => {},
      t: (fr: string, vars?: Record<string, string | number>) => interpolate(fr, vars),
    };
  }
  return ctx;
}

/**
 * Choisit la version linguistique d'un contenu saisi par la fédération
 * (une actualité a un titre français et, éventuellement, un titre anglais).
 */
export function pickLang(lang: Lang, fr: string | null | undefined, en: string | null | undefined) {
  if (lang === 'en' && en && en.trim()) return en;
  return fr ?? '';
}
