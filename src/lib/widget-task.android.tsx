import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { readWidgetData } from '@/lib/widget';
import { NextMatchWidget } from '@/widgets/next-match-widget';

// Variante ANDROID de la couche widget (Metro charge widget-task.ts ailleurs).
// Le handler tourne aussi en tâche de fond (sans app ouverte) : il lit le
// dernier instantané rangé par refreshWidgetData() et dessine le widget.

const WIDGET_NAME = 'NextMatch';

async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snap = await readWidgetData();
      props.renderWidget(<NextMatchWidget snap={snap} />);
      break;
    }
    // WIDGET_CLICK : l'ouverture de l'app (clickAction OPEN_APP) est gérée par
    // le système ; WIDGET_DELETED n'a rien à rendre.
    default:
      break;
  }
}

/** Appelé au point d'entrée (index.js) pour brancher la tâche de fond. */
export function registerWidgetTask() {
  registerWidgetTaskHandler(widgetTaskHandler);
}

/** Redessine les widgets posés à partir de l'instantané courant. */
export async function updateWidget() {
  try {
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: async () => <NextMatchWidget snap={await readWidgetData()} />,
      widgetNotFound: () => {},
    });
  } catch {
    // Aucun widget posé ou API indisponible : sans conséquence.
  }
}
