import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, DimensionValue, Pressable, Text, View } from 'react-native';

import { pickAndUploadImage } from '@/lib/upload';
import { C } from '@/lib/theme';

export function ImageField({
  label,
  value,
  onChange,
  folder,
  shape = 'circle',
}: {
  label: string;
  value?: string | null;
  onChange: (url: string) => void;
  folder: string;
  shape?: 'circle' | 'square' | 'wide';
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dims: { width: DimensionValue; height: number; borderRadius: number } =
    shape === 'wide'
      ? { width: '100%', height: 120, borderRadius: 12 }
      : shape === 'square'
        ? { width: 72, height: 72, borderRadius: 16 }
        : { width: 72, height: 72, borderRadius: 36 };

  async function pick() {
    setErr(null);
    setLoading(true);
    try {
      const url = await pickAndUploadImage(folder);
      if (url) onChange(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur d'envoi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ alignItems: shape === 'wide' ? 'stretch' : 'center', marginBottom: 4 }}>
      <Pressable
        onPress={pick}
        style={[
          { backgroundColor: '#12403A', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
          dims,
        ]}>
        {loading ? (
          <ActivityIndicator color={C.accent} />
        ) : value ? (
          <Image source={{ uri: value }} style={dims} contentFit="cover" />
        ) : (
          <Ionicons name="camera-outline" size={22} color="#3E6B62" />
        )}
      </Pressable>
      <Text style={{ color: C.dim, fontSize: 11, marginTop: 7 }}>{label}</Text>
      {err ? <Text style={{ color: C.red, fontSize: 11, marginTop: 4, textAlign: 'center' }}>{err}</Text> : null}
    </View>
  );
}
