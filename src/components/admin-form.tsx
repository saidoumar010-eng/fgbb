import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import { Button, Card, Header, Screen } from '@/components/ui';
import { C, S } from '@/lib/theme';

export function FormLabel({ children }: { children: string }) {
  return (
    <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>{children}</Text>
  );
}

export function AdminForm({
  title,
  children,
  onSave,
  saving,
  error,
  flash,
  saveLabel,
}: {
  title: string;
  children: ReactNode;
  onSave: () => void;
  saving?: boolean;
  error?: string | null;
  flash?: string | null;
  saveLabel?: string;
}) {
  return (
    <Screen>
      <Header
        title={title}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <Card style={{ margin: 0, borderRadius: 0, borderWidth: 0, backgroundColor: 'transparent', padding: S.lg }}>
        {flash ? (
          <Card style={{ borderColor: 'rgba(43,196,138,0.4)', marginBottom: 4 }}>
            <Text style={{ color: C.green, fontSize: 13 }}>{flash}</Text>
          </Card>
        ) : null}
        {children}
        {error ? <Text style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}
        <Button title={saveLabel ?? 'Enregistrer'} onPress={onSave} loading={saving} />
      </Card>
    </Screen>
  );
}
