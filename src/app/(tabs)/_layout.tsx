import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  const { t } = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: '#6F8B84',
        tabBarStyle: {
          backgroundColor: C.tabBar,
          borderTopColor: C.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Accueil'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="matchs"
        options={{
          title: t('Matchs'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="basketball-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="actus"
        options={{
          title: t('Actus'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="newspaper-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="classement"
        options={{
          title: t('Classement'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="compte"
        options={{
          title: t('Compte'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
