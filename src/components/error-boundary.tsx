import { Component, ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { C, R, S } from '@/lib/theme';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: S.xl }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '600' }}>Une erreur est survenue</Text>
          <ScrollView style={{ maxHeight: 220, marginTop: 12, alignSelf: 'stretch' }}>
            <Text style={{ color: C.dim, fontSize: 12, lineHeight: 18 }} selectable>
              {error.message}
            </Text>
          </ScrollView>
          <Pressable
            onPress={this.reset}
            style={{ marginTop: 20, backgroundColor: C.gold, borderRadius: R.md, paddingVertical: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: C.goldText, fontSize: 15, fontWeight: '600' }}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
