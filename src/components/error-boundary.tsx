import { Component, ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';

// L'écran de repli est un composant fonctionnel : les hooks (donc useT) sont
// interdits dans la classe ErrorBoundary elle-même.
function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useT();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: S.xl }}>
      <Text style={{ color: C.text, fontSize: 17, fontWeight: '600' }}>{t('Une erreur est survenue')}</Text>
      <ScrollView style={{ maxHeight: 220, marginTop: 12, alignSelf: 'stretch' }}>
        <Text style={{ color: C.dim, fontSize: 12, lineHeight: 18 }} selectable>
          {error.message}
        </Text>
      </ScrollView>
      <Pressable
        onPress={onRetry}
        style={{ marginTop: 20, backgroundColor: C.accent, borderRadius: R.md, paddingVertical: 12, paddingHorizontal: 24 }}>
        <Text style={{ color: C.accentText, fontSize: 15, fontWeight: '600' }}>{t('Réessayer')}</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return <ErrorFallback error={error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
