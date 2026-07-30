import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { CARD_SIZE } from '@/components/score-card';

/**
 * Version mobile du partage de carte.
 *
 * `Svg.toDataURL` rasterise la vue déjà rendue : la carte doit donc être
 * visible à l'écran (c'est l'aperçu de la feuille de match), ce qui tombe bien
 * — le supporter voit ce qu'il envoie avant de l'envoyer.
 *
 * `Share.share` de React Native ne transporte qu'un texte sur Android : il faut
 * écrire un vrai fichier et passer par expo-sharing pour qu'une image arrive
 * dans WhatsApp.
 */

export interface SvgCapture {
  toDataURL: (callback: (base64: string) => void, options?: { width: number; height: number }) => void;
}

export interface ShareCardInput {
  /** Référence du <Svg> rendu. `containerId` n'est utilisé que sur le web. */
  svg: SvgCapture | null;
  containerId?: string;
  filename: string;
  message: string;
}

function capture(svg: SvgCapture): Promise<string> {
  return new Promise((resolve, reject) => {
    // Pas de rejet natif si la capture échoue : on borne l'attente pour ne pas
    // laisser le bouton de partage tourner indéfiniment.
    const timer = setTimeout(() => reject(new Error('La carte n’a pas pu être générée.')), 8000);
    try {
      svg.toDataURL(
        (base64) => {
          clearTimeout(timer);
          base64 ? resolve(base64) : reject(new Error('La carte n’a pas pu être générée.'));
        },
        { width: CARD_SIZE, height: CARD_SIZE },
      );
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error('La carte n’a pas pu être générée.'));
    }
  });
}

export async function shareScoreCard({ svg, filename, message }: ShareCardInput) {
  if (!svg) throw new Error('Carte introuvable.');
  const base64 = await capture(svg);

  // Dossier de cache : le système peut le vider, ce qui est exactement le
  // cycle de vie voulu pour une image qu'on vient de partager.
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage n’est pas disponible sur cet appareil.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'image/png',
    dialogTitle: message,
    UTI: 'public.png',
  });
}
