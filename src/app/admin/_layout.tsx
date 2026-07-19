import { Redirect, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';

export default function AdminLayout() {
  const { loading, session, profile, isAdmin } = useAuth();
  const { t } = useT();

  // Profil encore en cours de chargement
  if (loading || (session && !profile)) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  if (!session) return <Redirect href="/login" />;

  if (!isAdmin) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
          {t('Accès réservé')}
        </Text>
        <Text style={{ color: C.dim, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
          {t("Ton compte n'a pas les droits d'administration de la fédération.")}
        </Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
