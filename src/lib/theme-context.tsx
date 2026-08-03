import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { refreshThemedStyles } from '@/components/ui';
import { applyPalette, type ThemeMode } from '@/lib/theme';

// Choix du thème par le supporter, mémorisé sur l'appareil. Le sombre reste le
// défaut (identité de la marque). Sur changement, on mute la palette partagée,
// on reconstruit les styles figés puis on remonte tout l'arbre via `key` pour
// que chaque écran relise `C.*`.

const STORAGE_KEY = 'fgbb.theme';

interface ThemeValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  // Appliqué pendant le rendu (avant les enfants) : la palette et les styles
  // partagés sont à jour au moment où le sous-arbre se (re)monte.
  applyPalette(mode);
  refreshThemedStyles();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark') setModeState(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const setMode = (m: ThemeMode) => {
      setModeState(m);
      AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
    };
    return { mode, setMode, toggle: () => setMode(mode === 'dark' ? 'light' : 'dark') };
  }, [mode]);

  // La clé force le remontage complet du sous-arbre à chaque bascule : c'est ce
  // qui fait relire la nouvelle palette aux écrans déjà rendus. Effet de bord
  // assumé : la navigation repart de l'accueil (action rare et volontaire).
  return (
    <ThemeContext.Provider value={value}>
      <Fragment key={mode}>{children}</Fragment>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { mode: 'dark', setMode: () => {}, toggle: () => {} };
  return ctx;
}
