import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MatchRow } from '@/components/match-row';
import { Card, Empty, Header, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listTableMatches } from '@/lib/db-matchday';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Espace table technique : réservé au rôle table_technique (et aux admins). On
 * y prépare le jour de match — désignation des arbitres et feuille de match.
 * Les garde-fous réels sont dans la base (migration 0022) ; l'écran se contente
 * de ne rien montrer à qui n'a pas le rôle.
 */
export default function TableHome() {
  const { t } = useT();
  const { isTableOfficial } = useAuth();
  const { data, loading, reload } = useFetch(() => (isTableOfficial ? listTableMatches() : Promise.resolve([])), [
    isTableOfficial,
  ]);
  const [refreshing, setRefreshing] = useState(false);

  const header = (
    <Header
      title={t('Table technique')}
      left={
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );

  if (!isTableOfficial) {
    return (
      <Screen>
        {header}
        <Empty
          icon="lock-closed-outline"
          title={t('Accès réservé')}
          subtitle={t('Cet espace est réservé aux officiels de table désignés par la fédération.')}
        />
      </Screen>
    );
  }

  const matches = data ?? [];
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <View style={{ padding: S.lg, gap: 9 }}>
        <Text style={{ color: C.dim, fontSize: 12.5 }}>
          {t('Matchs à venir et en direct. Touche un match pour désigner les arbitres et voir les feuilles.')}
        </Text>
        {matches.length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {loading ? t('Chargement…') : t('Aucun match à préparer.')}
            </Text>
          </Card>
        ) : (
          matches.map((m) => <MatchRow key={m.id} match={m} onPress={() => router.push(`/table/${m.id}`)} />)
        )}
      </View>
    </Screen>
  );
}
