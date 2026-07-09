import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { C, R } from '@/lib/theme';
import { toEmbed } from '@/lib/video';

export function VideoEmbed({ url }: { url?: string | null }) {
  const e = toEmbed(url);
  if (!e) return null;

  if (e.type === 'link') {
    return (
      <Pressable
        onPress={() => Linking.openURL(e.url)}
        style={{
          height: 80,
          borderRadius: R.lg,
          backgroundColor: '#11151C',
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        }}>
        <Ionicons name="play-circle-outline" size={22} color={C.red} />
        <Text style={{ color: C.text, fontSize: 14 }}>Ouvrir le résumé vidéo</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ height: 200, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#000' }}>
      <WebView
        source={{ uri: e.url }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}
