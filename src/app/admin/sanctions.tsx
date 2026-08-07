import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, Header, Pill, Row, Screen } from '@/components/ui';
import {
  formatGnf,
  listSanctions,
  sanctionKindLabel,
  sanctionStatusLabel,
} from '@/lib/db-officials';
import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { Sanction } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

function sanctionDetail(s: Sanction, t: (fr: string, vars?: Record<string, string | number>) => string) {
  if (s.kind === 'amende' && s.amount_gnf > 0) return formatGnf(s.amount_gnf);
  if (s.kind === 'suspension' && s.games > 0) return t('{n} match(s)', { n: s.games });
  return '';
}

export default function AdminSanctions() {
  const { t } = useT();
  const { data, loading } = useFetch(() => listSanctions());
  const sanctions = data ?? [];

  return (
    <Screen>
      <Header
        title={t('Discipline')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      <View style={{ padding: S.lg }}>
        <Button
          title={t('Nouvelle sanction')}
          icon="add"
          onPress={() => router.push('/admin/sanction-form' as never)}
        />
      </View>

      {sanctions.length === 0 ? (
        <Empty
          icon="alert-circle-outline"
          title={loading ? t('Chargement…') : t('Aucune sanction')}
          subtitle={loading ? undefined : t('Les décisions disciplinaires publiées apparaîtront ici.')}
        />
      ) : (
        <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
          {sanctions.map((s) => {
            const detail = sanctionDetail(s, t);
            return (
              <Pressable key={s.id} onPress={() => router.push(`/admin/sanction-form?id=${s.id}` as never)}>
                <Card style={{ padding: 0 }}>
                  <Row style={{ padding: 12, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                        {s.player?.full_name ?? s.team?.name ?? '—'}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                        {t(sanctionKindLabel(s.kind))}
                        {detail ? ` · ${detail}` : ''} · {fullDate(s.decided_at)}
                      </Text>
                    </View>
                    <Pill
                      label={t(sanctionStatusLabel(s.status))}
                      tone={s.status === 'active' ? 'red' : s.status === 'served' ? 'green' : 'neutral'}
                    />
                    <Ionicons name="chevron-forward" size={18} color={C.dim} />
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
