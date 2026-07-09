// Convertit un lien YouTube / Facebook en URL intégrable (embed).
export interface EmbedResult {
  type: 'embed' | 'link';
  url: string;
}

export function toEmbed(url?: string | null): EmbedResult | null {
  if (!url) return null;
  const u = url.trim();

  // YouTube
  const yt =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (yt) {
    return { type: 'embed', url: `https://www.youtube.com/embed/${yt[1]}?playsinline=1` };
  }

  // Facebook (lecteur via plugin)
  if (/facebook\.com|fb\.watch/.test(u)) {
    return {
      type: 'embed',
      url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`,
    };
  }

  // Lien non reconnu : on l'ouvrira dans le navigateur
  return { type: 'link', url: u };
}
