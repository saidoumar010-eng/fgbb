import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import type Svg from 'react-native-svg';

import { ScoreCard } from '@/components/score-card';
import { Row } from '@/components/ui';
import { shareScoreCard, type SvgCapture } from '@/lib/share-card';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Match } from '@/lib/types';

// Conteneur identifié : sur le web, c'est par lui que l'on retrouve le <svg>
// du DOM à sérialiser (react-native-svg n'y expose pas toDataURL).
const CONTAINER_ID = 'fgbb-score-card';

/**
 * Aperçu avant partage. Montrer la carte n'est pas décoratif : le supporter
 * envoie une image à ses contacts, il doit voir exactement ce qui partira.
 */
export function ShareCardModal({
  match,
  homeScore,
  awayScore,
  live,
  visible,
  onClose,
}: {
  match: Match;
  homeScore: number;
  awayScore: number;
  live: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const svgRef = useRef<Svg>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const line =
    match.status === 'scheduled'
      ? `${match.home_team?.name} vs ${match.away_team?.name}`
      : `${match.home_team?.name} ${homeScore} – ${awayScore} ${match.away_team?.name}`;
  const comp = match.competition?.name ? ` · ${match.competition.name}` : '';
  const message = `🏀 ${line}${comp}\n${t("Suivez le basket guinéen sur l'application FGBB.")}`;

  async function shareImage() {
    setErr(null);
    setBusy(true);
    try {
      await shareScoreCard({
        svg: svgRef.current as unknown as SvgCapture | null,
        containerId: CONTAINER_ID,
        filename: 'fgbb-resultat.png',
        message,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Le partage a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  async function shareText() {
    try {
      await Share.share({ message });
      onClose();
    } catch {
      // L'utilisateur a simplement fermé la feuille de partage.
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: S.lg }}>
        <View style={{ backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{t('Partager le résultat')}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Ionicons name="close" size={22} color={C.muted} />
            </Pressable>
          </Row>

          {/* Rendu à 300 px pour l'aperçu ; la capture repasse en 1080. */}
          <View nativeID={CONTAINER_ID} style={{ alignItems: 'center' }}>
            <ScoreCard
              ref={svgRef}
              match={match}
              homeScore={homeScore}
              awayScore={awayScore}
              live={live}
              size={300}
            />
          </View>

          {err ? <Text style={{ color: C.red, fontSize: 12 }}>{err}</Text> : null}

          <Pressable
            onPress={busy ? undefined : shareImage}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                backgroundColor: C.accent,
                borderRadius: R.md,
                paddingVertical: 14,
                alignItems: 'center',
              },
              (pressed || busy) && { opacity: 0.85 },
            ]}>
            {busy ? (
              <ActivityIndicator color={C.accentText} />
            ) : (
              <Row style={{ gap: 8 }}>
                <Ionicons name="image-outline" size={18} color={C.accentText} />
                <Text style={{ color: C.accentText, fontSize: 15, fontWeight: '600' }}>
                  {Platform.OS === 'web' ? t('Enregistrer l’image') : t('Partager l’image')}
                </Text>
              </Row>
            )}
          </Pressable>

          <Pressable
            onPress={shareText}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                borderRadius: R.md,
                paddingVertical: 13,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: C.borderStrong,
              },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={{ color: C.muted, fontSize: 14 }}>{t('Partager en texte')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
