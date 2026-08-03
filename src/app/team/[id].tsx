import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ClubPostCard } from '@/components/club-post-card';
import { MatchRow } from '@/components/match-row';
import { Card, Crest, Empty, Header, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  addFavorite,
  getTeam,
  getTeamMatches,
  getTeamPlayers,
  getTeamStanding,
  listFavoriteTeams,
  listTeamPosts,
  removeFavorite,
} from '@/lib/db';
import { getTeamSeasonStat } from '@/lib/db-stats';
import { teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

export default function TeamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const team = useFetch(() => getTeam(id), [id], { cacheKey: `team:${id}` });
  const standing = useFetch(() => getTeamStanding(id), [id], { cacheKey: `team-standing:${id}` });
  const season = useFetch(() => getTeamSeasonStat(id), [id], { cacheKey: `team-season:${id}` });
  const players = useFetch(() => getTeamPlayers(id), [id], { cacheKey: `team-players:${id}` });
  const matches = useFetch(() => getTeamMatches(id), [id], { cacheKey: `team-matches:${id}` });
  const [tab, setTab] = useState<'roster' | 'cal' | 'posts'>('roster');

  const { session } = useAuth();
  const favs = useFetch(() => listFavoriteTeams(), []);
  const isFav = (favs.data ?? []).some((f) => f.id === id);
  async function toggleFav() {
    if (!session) {
      router.push('/login');
      return;
    }
    if (isFav) await removeFavorite(session.user.id, id);
    else await addFavorite(session.user.id, id);
    favs.reload();
  }

  const tm = team.data;
  const st = standing.data;
  const sub = tm
    ? [tm.city, tm.division, tm.founded_year ? t('Fondé en {y}', { y: tm.founded_year }) : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Screen>
      <Header
        title={t('Club')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={
          <Pressable onPress={toggleFav}>
            <Ionicons name={isFav ? 'star' : 'star-outline'} size={22} color={isFav ? C.accent : C.muted} />
          </Pressable>
        }
      />
      {!tm ? (
        <Empty icon="shield-outline" title={team.loading ? t('Chargement…') : t('Club introuvable')} />
      ) : (
        <View>
          <View style={{ padding: S.lg }}>
            <Card style={{ alignItems: 'center' }}>
              <Crest label={teamShort(tm)} color={tm.color ?? C.surface2} size={64} image={tm.logo_url} />
              <Text style={{ color: C.text, fontSize: 19, fontWeight: '600', marginTop: 12 }}>{tm.name}</Text>
              <Text style={{ color: C.dim, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{sub}</Text>
              <Row style={{ marginTop: 14, gap: 22 }}>
                <Stat label={t('Joués')} value={st?.played ?? 0} />
                <Stat label={t('Victoires')} value={st?.wins ?? 0} color={C.green} />
                <Stat label={t('Défaites')} value={st?.losses ?? 0} />
                <Stat label={t('Points')} value={st?.points ?? 0} color={C.accent} />
              </Row>
            </Card>
          </View>

          {season.data ? (
            <View style={{ paddingHorizontal: S.lg, marginTop: -S.sm, marginBottom: S.md }}>
              <Pressable onPress={() => router.push('/stats-equipes' as never)}>
                <Card>
                  <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{t('Moyennes par match')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.dim} />
                  </Row>
                  <Row style={{ justifyContent: 'space-around' }}>
                    <Stat label={t('Marqués')} value={season.data.pts_for} color={C.accent} />
                    <Stat label={t('Encaissés')} value={season.data.pts_against} />
                    <Stat
                      label={t('Différentiel')}
                      value={season.data.diff > 0 ? `+${season.data.diff}` : season.data.diff}
                      color={season.data.diff >= 0 ? C.green : C.red}
                    />
                    <Stat label={t('Record')} value={season.data.best_score} />
                  </Row>
                </Card>
              </Pressable>
            </View>
          ) : null}

          <Row style={{ marginHorizontal: S.lg, gap: 6 }}>
            <Tab label={t('Effectif')} active={tab === 'roster'} onPress={() => setTab('roster')} />
            <Tab label={t('Calendrier')} active={tab === 'cal'} onPress={() => setTab('cal')} />
            <Tab label={t('Publications')} active={tab === 'posts'} onPress={() => setTab('posts')} />
          </Row>

          {tab === 'posts' ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12 }}>
              <TeamPosts teamId={id} />
            </View>
          ) : tab === 'roster' ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12 }}>
              {(players.data ?? []).length === 0 ? (
                <Card>
                  <Text style={{ color: C.dim, fontSize: 13 }}>{t("Aucun joueur dans l'effectif.")}</Text>
                </Card>
              ) : (
                <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
                  {(players.data ?? []).map((pl, i, arr) => (
                    <Pressable key={pl.id} onPress={() => router.push(`/player/${pl.id}`)}>
                      <Row
                        style={{ paddingVertical: 11, gap: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                        <Crest label={pl.number ? `${pl.number}` : teamShort(tm)} color={tm.color ?? C.surface2} size={30} round />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 14 }}>{pl.full_name}</Text>
                          <Text style={{ color: C.dim, fontSize: 12 }}>{pl.position ?? ''}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={C.dim} />
                      </Row>
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          ) : (
            <View style={{ paddingHorizontal: S.lg, paddingTop: 12, gap: 9 }}>
              {(matches.data ?? []).length === 0 ? (
                <Card>
                  <Text style={{ color: C.dim, fontSize: 13 }}>{t('Aucun match programmé.')}</Text>
                </Card>
              ) : (
                (matches.data ?? []).map((m) => (
                  <MatchRow key={m.id} match={m} onPress={() => router.push(`/match/${m.id}`)} />
                ))
              )}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value, color = '#fff' }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color, fontSize: 18, fontWeight: '600' }}>{value}</Text>
      <Text style={{ color: C.dim, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function TeamPosts({ teamId }: { teamId: string }) {
  const { t } = useT();
  const { data, loading } = useFetch(() => listTeamPosts(teamId), [teamId]);
  const posts = data ?? [];
  if (posts.length === 0) {
    return (
      <Card>
        <Text style={{ color: C.dim, fontSize: 13 }}>
          {loading ? t('Chargement…') : t('Aucune publication pour le moment.')}
        </Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: 9 }}>
      {posts.map((p) => (
        <ClubPostCard key={p.id} post={p} />
      ))}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: active ? C.surface2 : C.surface,
        borderWidth: 1,
        borderColor: active ? 'rgba(59,214,27,0.5)' : 'transparent',
      }}>
      <Text style={{ color: active ? '#fff' : C.muted, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}
