import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Crest, Header, Row, Screen, SectionTitle } from '@/components/ui';
import { listCompetitions } from '@/lib/db';
import { errorMessage } from '@/lib/db-fan';
import { getFederationStats, getTopFollowedTeams } from '@/lib/db-stats';
import { exportSeasonReportPdf } from '@/lib/export';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

const ALL = '__all__';

export default function AdminFederationDashboard() {
  const { t } = useT();
  const stats = useFetch(() => getFederationStats(), []);
  const topTeams = useFetch(() => getTopFollowedTeams(6), []);
  const comps = useFetch(() => listCompetitions(), []);

  const [compId, setCompId] = useState<string>(ALL);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const s = stats.data;
  const tiles: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }[] = s
    ? [
        { label: t('Supporters'), value: s.fans, icon: 'people-outline' },
        { label: t('Pronostics'), value: s.predictions, icon: 'trophy-outline' },
        { label: t('Votes MVP'), value: s.mvp_votes, icon: 'star-outline' },
        { label: t('Votes sondages'), value: s.poll_votes, icon: 'bar-chart-outline' },
        { label: t('Parties de quiz'), value: s.quiz_attempts, icon: 'help-circle-outline' },
        { label: t('Abonnements joueurs'), value: s.follows, icon: 'heart-outline' },
      ]
    : [];

  async function exportReport() {
    setErr(null);
    setExporting(true);
    try {
      const comp =
        compId === ALL ? null : (comps.data ?? []).find((c) => c.id === compId) ?? null;
      await exportSeasonReportPdf(comp ? { id: comp.id, name: comp.name } : null);
    } catch (e) {
      setErr(errorMessage(e, t('Export impossible pour l’instant.')));
    } finally {
      setExporting(false);
    }
  }

  const onRefresh = async () => {
    await Promise.all([stats.reload(), topTeams.reload()]);
  };

  return (
    <Screen refreshing={stats.loading} onRefresh={onRefresh}>
      <Header
        title={t('Tableau de bord')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <SectionTitle title={t('Audience')} />
      <View style={{ paddingHorizontal: S.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {tiles.map((tile) => (
          <View key={tile.label} style={{ width: '31.5%' }}>
            <Card style={{ paddingVertical: 13, alignItems: 'center', gap: 4 }}>
              <Ionicons name={tile.icon} size={18} color={C.accent} />
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>{tile.value}</Text>
              <Text style={{ color: C.dim, fontSize: 10.5, textAlign: 'center' }}>{tile.label}</Text>
            </Card>
          </View>
        ))}
        {!s && !stats.loading ? (
          <Card style={{ flex: 1 }}>
            <Text style={{ color: C.dim, fontSize: 13 }}>{t('Statistiques indisponibles.')}</Text>
          </Card>
        ) : null}
      </View>

      <SectionTitle title={t('Clubs les plus suivis')} />
      <View style={{ paddingHorizontal: S.lg, gap: 9 }}>
        {(topTeams.data ?? []).length === 0 ? (
          <Card>
            <Text style={{ color: C.dim, fontSize: 13 }}>
              {topTeams.loading ? t('Chargement…') : t('Aucun abonné pour le moment.')}
            </Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
            {(topTeams.data ?? []).map((tm, i, arr) => (
              <Row
                key={tm.team_id}
                style={{
                  paddingVertical: 10,
                  gap: 10,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                <Text style={{ color: C.dim, fontSize: 13, width: 16 }}>{i + 1}</Text>
                <Crest label={tm.team_name.slice(0, 3).toUpperCase()} color={C.surface2} size={26} />
                <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {tm.team_name}
                </Text>
                <Text style={{ color: C.accent, fontSize: 14, fontWeight: '700' }}>{tm.followers}</Text>
              </Row>
            ))}
          </Card>
        )}
      </View>

      <SectionTitle title={t('Rapport de saison')} />
      <View style={{ paddingHorizontal: S.lg, paddingBottom: S.lg }}>
        <Card>
          <Text style={{ color: C.dim, fontSize: 12.5, marginBottom: 8 }}>
            {t('Classement, meilleurs marqueurs et bilans d’équipe, en PDF.')}
          </Text>
          {(comps.data ?? []).length > 0 ? (
            <ChipSelect
              options={[
                { id: ALL, label: t('Toutes les compétitions') },
                ...(comps.data ?? []).map((c) => ({ id: c.id, label: c.name })),
              ]}
              value={compId}
              onChange={setCompId}
              wrap
            />
          ) : null}
          {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
          <Button title={t('Exporter le rapport (PDF)')} onPress={exportReport} loading={exporting} icon="document-text-outline" />
        </Card>
      </View>
    </Screen>
  );
}
