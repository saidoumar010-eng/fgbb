import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetSnapshot } from '@/lib/widget';

// Rendu du widget d'écran d'accueil Android. N'est chargé QUE par la variante
// native (widget-task.android.tsx) : ni le web ni iOS ne l'importent, donc la
// dépendance react-native-android-widget n'entre jamais dans leur bundle.
//
// Couleurs en dur (palette sombre de la marque) : le widget n'a pas accès au
// thème de l'app et doit rester lisible sur n'importe quel fond d'écran.
const BG = '#06201C';
const ACCENT = '#3BD61B';
const TEXT = '#F2F7F5';
const MUTED = '#92ACA5';

export function NextMatchWidget({ snap }: { snap: WidgetSnapshot | null }) {
  const next = snap?.next ?? null;
  const last = snap?.last ?? null;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
      <TextWidget text="FGBB" style={{ fontSize: 11, color: ACCENT, fontWeight: '700', letterSpacing: 1 }} />

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <TextWidget text="Prochain match" style={{ fontSize: 10, color: MUTED }} />
        {next ? (
          <TextWidget
            text={`${next.homeShort}  vs  ${next.awayShort}`}
            style={{ fontSize: 16, color: TEXT, fontWeight: '600' }}
            maxLines={1}
            truncate="END"
          />
        ) : (
          <TextWidget text="Aucun match à venir" style={{ fontSize: 13, color: TEXT }} maxLines={1} truncate="END" />
        )}
      </FlexWidget>

      {last ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          <TextWidget text="Dernier résultat" style={{ fontSize: 10, color: MUTED }} />
          <TextWidget
            text={`${last.homeShort} ${last.homeScore} – ${last.awayScore} ${last.awayShort}`}
            style={{ fontSize: 13, color: TEXT }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
      ) : (
        <TextWidget text=" " style={{ fontSize: 10, color: MUTED }} />
      )}
    </FlexWidget>
  );
}
