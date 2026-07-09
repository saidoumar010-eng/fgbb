import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, R, S } from '@/lib/theme';

const logoCard = require('../../assets/images/logo-card.png');
const logoMark = require('../../assets/images/logo-mark.png');

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: S.xl * 2 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <SafeAreaView style={st.screen} edges={edges}>
      {inner}
    </SafeAreaView>
  );
}

export function Header({
  title,
  left,
  right,
  big,
}: {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  big?: ReactNode;
}) {
  return (
    <View style={st.header}>
      <View style={st.headerSide}>{left}</View>
      {big ?? <Text style={st.headerTitle}>{title}</Text>}
      <View style={[st.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

// Logo officiel FGBB (image fournie par la fédération).
// Petites tailles : marque carrée (éléphant + ballon) sur pastille blanche.
// Grandes tailles (>= 64) : carte blanche complète FGBB / éléphant / Guinée.
export function Logo({ size = 36 }: { size?: number }) {
  const big = size >= 64;
  if (big) {
    return (
      <Image
        source={logoCard}
        style={{ width: Math.round(size * 0.65), height: size, borderRadius: R.sm }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
      }}>
      <Image source={logoMark} style={{ width: size, height: size }} contentFit="cover" />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={st.sectionTitle}>
      <Text style={st.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

type Tone = 'accent' | 'red' | 'green' | 'neutral';
const toneBg: Record<Tone, string> = {
  accent: C.accentSoft,
  red: C.redSoft,
  green: C.greenSoft,
  neutral: 'rgba(255,255,255,0.07)',
};
const toneFg: Record<Tone, string> = {
  accent: C.accent,
  red: C.red,
  green: C.green,
  neutral: C.muted,
};

export function Pill({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  return (
    <View style={[st.pill, { backgroundColor: toneBg[tone] }]}>
      {dot && <View style={[st.pillDot, { backgroundColor: toneFg[tone] }]} />}
      <Text style={[st.pillText, { color: toneFg[tone] }]}>{label}</Text>
    </View>
  );
}

export function Crest({
  label,
  color = C.surface2,
  size = 30,
  round,
  image,
}: {
  label: string;
  color?: string;
  size?: number;
  round?: boolean;
  image?: string | null;
}) {
  const radius = round ? size / 2 : 8;
  if (image) {
    return <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.34 }}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  style,
  ...props
}: { label?: string } & TextInputProps & { style?: ViewStyle }) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
      {label ? <Text style={st.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.dim} style={[st.input, style as any]} {...props} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  tone = 'accent',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress?: () => void;
  tone?: 'accent' | 'alt';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const alt = tone === 'alt';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        st.btn,
        alt ? st.btnAlt : st.btnAccent,
        (disabled || loading) && { opacity: 0.6 },
        pressed && { opacity: 0.85 },
      ]}>
      {loading ? (
        <ActivityIndicator color={alt ? C.accent : C.accentText} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Ionicons name={icon} size={18} color={alt ? C.accent : C.accentText} />}
          <Text style={[st.btnText, { color: alt ? C.accent : C.accentText }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Empty({
  icon = 'albums-outline',
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={st.empty}>
      <Ionicons name={icon} size={34} color={C.dim} />
      <Text style={st.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={st.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerSide: { minWidth: 44, justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '600' },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    padding: S.md,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: S.lg,
    marginTop: S.lg,
    marginBottom: S.sm,
  },
  sectionTitleText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.sm,
    alignSelf: 'flex-start',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  label: { color: C.muted, fontSize: 12, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#09271F',
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 46,
    color: C.text,
    fontSize: 14,
  },
  btn: { borderRadius: R.md, paddingVertical: 14, alignItems: 'center', marginTop: S.lg },
  btnAccent: { backgroundColor: C.accent },
  btnAlt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(59,214,27,0.4)' },
  btnText: { fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  emptySub: { color: C.dim, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});
