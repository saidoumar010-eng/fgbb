import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProgressionChart } from '@/components/progression-chart';
import { Card, Crest, Empty, Header, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { getPlayer, getPlayerGames, getPlayerSeason } from '@/lib/db';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

function age(birth?: string | null) {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}
function heightM(cm?: number | null) {
  return cm ? `${(cm / 100).toFixed(2).replace('.', ',')} m` : null;
}

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const player = useFetch(() => getPlayer(id), [id], { cacheKey: `player:${id}` });
  const season = useFetch(() => getPlayerSeason(id), [id], { cacheKey: `player-season:${id}` });
  const games = useFetch(() => getPlayerGames(id), [id], { cacheKey: `player-games:${id}` });

  const p = player.data;
  const s = season.data;
  const sub = p
    ? [p.team?.name, p.position, heightM(p.height_cm), age(p.birth_date) ? t('{n} ans', { n: age(p.birth_date)! }) : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  const metrics: [string, string | number][] = [
    [t('Points'), s?.ppg ?? '—'],
    [t('Passes'), s?.apg ?? '—'],
    [t('Rebonds'), s?.rpg ?? '—'],
    [t('Intercep.'), s?.spg ?? '—'],
    [t('% tirs'), s ? `${s.fg_pct}%` : '—'],
    [t('% 3 pts'), s ? `${s.three_pct}%` : '—'],
  ];

  return (
    <Screen>
      <Header
        title={t('Joueur')}
        left={
          <View>
            <Ionicons name="chevron-back" size={24} color={C.muted} onPress={() => router.back()} />
          </View>
        }
        right={
          <Ionicons
            name="git-compare-outline"
            size={22}
            color={C.muted}
            onPress={() => router.push(`/compare?a=${id}`)}
          />
        }
      />
      {!p ? (
        <Empty icon="person-outline" title={player.loading ? t('Chargement…') : t('Joueur introuvable')} />
      ) : (
        <View>
          <View style={{ padding: S.lg }}>
            <Card style={{ alignItems: 'center' }}>
              <Crest
                label={p.full_name.slice(0, 2).toUpperCase()}
                color={p.team?.color ?? C.surface2}
                size={74}
                round
                image={p.photo_url}
              />
              <Text style={{ color: C.text, fontSize: 19, fontWeight: '600', marginTop: 12 }}>
                {p.full_name} {p.number ? <Text style={{ color: C.dim }}>#{p.number}</Text> : null}
              </Text>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 5, textAlign: 'center' }}>{sub}</Text>
              {p.team?.is_national ? (
                <View style={{ marginTop: 11 }}>
                  <Pill label="Syli National" tone="green" />
                </View>
              ) : null}
            </Card>
          </View>

          <SectionTitle title={t('Moyennes de la saison')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: S.lg, gap: 9 }}>
            {metrics.map(([label, val]) => (
              <View
                key={label}
                style={{
                  width: '31.5%',
                  backgroundColor: C.surface2,
                  borderRadius: 11,
                  paddingVertical: 11,
                  alignItems: 'center',
                }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600' }}>{val}</Text>
                <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{label}</Text>
              </View>
            ))}
          </View>

          <SectionTitle title={t('Derniers matchs')} />
          <View style={{ paddingHorizontal: S.lg }}>
            {(games.data ?? []).length === 0 ? (
              <Card>
                <Text style={{ color: C.dim, fontSize: 13 }}>{t('Aucune statistique enregistrée.')}</Text>
              </Card>
            ) : (
              <Card style={{ paddingVertical: 6, paddingHorizontal: 11 }}>
                <Row style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ flex: 1, color: C.dim, fontSize: 11 }}>{t('Adversaire')}</Text>
                  <Text style={gh}>{t('PTS')}</Text>
                  <Text style={gh}>{t('REB')}</Text>
                  <Text style={gh}>{t('PD')}</Text>
                </Row>
                {(games.data ?? []).map((g, i, arr) => {
                  const mt = g.match;
                  // L'équipe portée par la ligne de stats est celle du jour du
                  // match : après un transfert, le club actuel du joueur
                  // désignerait le mauvais adversaire.
                  const side = g.team_id ?? p.team_id;
                  const isHome = mt?.home_team_id === side;
                  const opp = isHome ? mt?.away_team : mt?.home_team;
                  return (
                    <Row
                      key={g.id}
                      style={{ paddingVertical: 8, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                      <Text style={{ flex: 1, color: C.text, fontSize: 12.5 }}>vs {teamShort(opp)}</Text>
                      <Text style={gc}>{g.points}</Text>
                      <Text style={gc}>{g.rebounds}</Text>
                      <Text style={gc}>{g.assists}</Text>
                    </Row>
                  );
                })}
              </Card>
            )}
          </View>

          <SectionTitle title={t('Évolution')} />
          <View style={{ paddingHorizontal: S.lg }}>
            <ProgressionChart playerId={id} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const gh = { width: 40, textAlign: 'center' as const, color: C.dim, fontSize: 11 };
const gc = { width: 40, textAlign: 'center' as const, color: C.muted, fontSize: 12.5 };
