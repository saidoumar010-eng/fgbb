import { CARD_SIZE } from '@/components/score-card';

/**
 * Version web du partage de carte.
 *
 * `toDataURL` de react-native-svg n'existe pas sur le web : le composant y rend
 * un vrai <svg> du DOM. On le sérialise, on le peint dans un canvas, et on
 * obtient le même PNG que sur mobile.
 */

export interface ShareCardInput {
  /** Identifiant du conteneur qui porte le <svg> (prop nativeID côté RN). */
  containerId: string;
  filename: string;
  message: string;
}

async function toPngBlob(svgEl: SVGElement): Promise<Blob> {
  // La feuille sérialisée doit être autonome : le canvas ne va pas rechercher
  // les styles de la page, tout est déjà en attributs de présentation.
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Rendu de la carte impossible.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = CARD_SIZE;
    canvas.height = CARD_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible.');
    ctx.drawImage(img, 0, 0, CARD_SIZE, CARD_SIZE);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export PNG impossible.'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shareScoreCard({ containerId, filename, message }: ShareCardInput) {
  const container = document.getElementById(containerId);
  const svgEl = container?.querySelector('svg');
  if (!svgEl) throw new Error('Carte introuvable.');

  const blob = await toPngBlob(svgEl);
  const file = new File([blob], filename, { type: 'image/png' });

  // Partage natif du navigateur quand il accepte les fichiers (Android/Chrome,
  // iOS/Safari) ; sinon téléchargement, seule issue sur un navigateur de bureau.
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], text: message });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
