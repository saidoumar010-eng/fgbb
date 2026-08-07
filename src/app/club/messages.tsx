import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Empty, Header, Row, Screen } from '@/components/ui';
import { listMyClubMessages, markClubMessagesRead } from '@/lib/db-messages';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { ClubInboxMessage } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Messages reçus de la fédération. À l'ouverture, on enregistre l'accusé de
// lecture ; l'affichage garde l'état initial pour signaler « Nouveau ».
export default function ClubMessagesScreen() {
  const { t } = useT();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const { data, loading, reload } = useFetch(
    () => (team ? listMyClubMessages(team) : Promise.resolve([] as ClubInboxMessage[])),
    [team],
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Accusé de lecture, sans recharger : la liste garde ses badges « Nouveau »
    // pour cette visite, la lecture est enregistrée côté serveur.
    if (team) markClubMessagesRead(team).catch(() => {});
  }, [team]);

  const rows = (data ?? []).filter((r) => r.message);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Header
        title={t('Messages')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      {rows.length === 0 ? (
        <Empty
          icon="mail-outline"
          title={loading ? t('Chargement…') : t('Aucun message')}
          subtitle={loading ? undefined : t('Les messages de la fédération apparaîtront ici.')}
        />
      ) : (
        <View style={{ padding: S.lg, gap: 9 }}>
          {rows.map((r) => (
            <Card key={r.message!.id} style={{ borderColor: r.read_at ? C.border : C.accent, borderWidth: 1 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{r.message!.title}</Text>
                {!r.read_at ? (
                  <View style={{ backgroundColor: C.accentSoft, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <Text style={{ color: C.accent, fontSize: 10.5, fontWeight: '700' }}>{t('Nouveau')}</Text>
                  </View>
                ) : null}
              </Row>
              <Text style={{ color: C.muted, fontSize: 13.5, lineHeight: 20 }}>{r.message!.body}</Text>
              <Text style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>{fullDate(r.message!.created_at)}</Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
