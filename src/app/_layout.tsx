import 'react-native-url-polyfill/auto';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { C } from '@/lib/theme';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { refreshWidgetData } from '@/lib/widget';
import { updateWidget } from '@/lib/widget-task';

export default function RootLayout() {
  // ThemeProvider est volontairement SOUS Auth et I18n : sa bascule remonte le
  // sous-arbre (pour relire la palette), et on ne veut pas réinitialiser la
  // session ni la langue à chaque changement de thème.
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

// Sous le ThemeProvider : la barre de statut suit le thème (texte clair sur
// fond sombre, texte sombre sur fond clair) et la pile lit la palette active.
function ThemedShell() {
  const { mode } = useTheme();

  // Tient à jour l'instantané du widget d'écran d'accueil : au lancement puis
  // à chaque retour au premier plan. Le widget natif (voir WIDGET.md) lit cet
  // instantané ; sans branchement natif l'appel est simplement inoffensif.
  useEffect(() => {
    const sync = () => refreshWidgetData(new Date().toISOString()).then(() => updateWidget());
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: C.bg },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        </Stack>
      </ErrorBoundary>
    </>
  );
}
