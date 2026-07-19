import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Card, Crest, Row, SectionTitle } from '@/components/ui';
import { listMatchOfficials, officialRoleLabel, refereeLevelLabel } from '@/lib/db-officials';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import { useFetch } from '@/lib/useFetch';

/**
 * Arbitres désignés sur un match (partie publique de la feuille de match).
 * Ne rend rien tant qu'aucune désignation n'a été faite : la plupart des
 * matchs de la base n'en ont pas et un bloc vide alourdirait la fiche.
 */
export function MatchOfficials({ matchId }: { matchId: string }) {
  const { t } = useT();
  const { data } = useFetch(() => listMatchOfficials(matchId), [matchId]);
  const officials = data ?? [];

  if (officials.length === 0) return null;

  return (
    <View>
      <SectionTitle title={t('Arbitres du match')} />
      <View style={{ paddingHorizontal: S.lg }}>
        <Card style={{ paddingVertical: 4, paddingHorizontal: 13 }}>
          {officials.map((o, i) => (
            <Row
              key={o.referee_id}
              style={{
                paddingVertical: 10,
                gap: 12,
                borderBottomWidth: i < officials.length - 1 ? 1 : 0,
                borderBottomColor: C.border,
              }}>
              {o.referee?.photo_url ? (
                <Crest label="" color={C.surface2} size={30} round image={o.referee.photo_url} />
              ) : (
                <Ionicons name="person-outline" size={20} color={C.accent} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14 }}>{o.referee?.full_name ?? '—'}</Text>
                <Text style={{ color: C.dim, fontSize: 12 }}>
                  {t(officialRoleLabel(o.role))}
                  {o.referee?.level ? ` · ${t(refereeLevelLabel(o.referee.level))}` : ''}
                </Text>
              </View>
            </Row>
          ))}
        </Card>
      </View>
    </View>
  );
}
