import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { SectionTitle } from '@/components/ui';
import { listPhotos } from '@/lib/db-content';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Photo } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const COLS = 3;
const GAP = 6;

/**
 * Galerie d'un match (`matchId`) ou d'un album libre (`album`).
 * Ne rend rien tant qu'il n'y a aucune photo : le composant peut donc être
 * inséré sans condition dans une page match.
 */
export function PhotoGallery({
  matchId,
  album,
  title,
  showTitle = true,
  padded = true,
}: {
  matchId?: string | null;
  album?: string | null;
  title?: string;
  showTitle?: boolean;
  padded?: boolean;
}) {
  const { t } = useT();
  const { data } = useFetch(() => listPhotos({ matchId, album }), [matchId, album]);
  // Largeur mesurée plutôt que celle de l'écran : le composant s'adapte au
  // conteneur qui l'accueille, quelle que soit la marge de la page hôte.
  const [width, setWidth] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);

  const photos = data ?? [];
  if (photos.length === 0) return null;

  const size = (width - GAP * (COLS - 1)) / COLS;

  return (
    <View>
      {showTitle ? (
        <SectionTitle title={`${title ?? t('Photos')} · ${photos.length}`} />
      ) : null}

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: GAP,
          paddingHorizontal: padded ? S.lg : 0,
        }}>
        {width > 0 &&
          photos.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => setViewing(i)}
              style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
              <Image
                source={{ uri: p.url }}
                style={{ width: size, height: size, borderRadius: R.sm, backgroundColor: C.surface2 }}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          ))}
      </View>

      <Viewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
    </View>
  );
}

// Visionneuse plein écran : image en entier, légende, crédit, navigation.
function Viewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: Photo[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const current = index === null ? null : photos[index];

  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: S.lg,
            paddingTop: 52,
            paddingBottom: S.sm,
          }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {current ? t('{n} sur {total}', { n: (index ?? 0) + 1, total: photos.length }) : ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          {current ? (
            <Image
              source={{ uri: current.url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              transition={120}
            />
          ) : null}
        </View>

        <View style={{ paddingHorizontal: S.lg, paddingBottom: 44, paddingTop: S.md, gap: S.md }}>
          {current?.caption ? (
            <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{current.caption}</Text>
          ) : null}
          {current?.credit ? (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {t('Photo : {credit}', { credit: current.credit })}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <NavButton
              icon="chevron-back"
              label={t('Précédent')}
              disabled={index === null || index === 0}
              onPress={() => index !== null && onIndex(index - 1)}
            />
            <NavButton
              icon="chevron-forward"
              label={t('Suivant')}
              right
              disabled={index === null || index >= photos.length - 1}
              onPress={() => index !== null && onIndex(index + 1)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavButton({
  icon,
  label,
  onPress,
  disabled,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  right?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: right ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: R.pill,
          backgroundColor: 'rgba(255,255,255,0.12)',
          opacity: disabled ? 0.3 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
