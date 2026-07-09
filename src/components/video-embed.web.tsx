import { toEmbed } from '@/lib/video';
import { C } from '@/lib/theme';

export function VideoEmbed({ url }: { url?: string | null }) {
  const e = toEmbed(url);
  if (!e) return null;

  if (e.type === 'link') {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" style={{ color: C.gold, fontSize: 14 }}>
        Ouvrir le résumé vidéo
      </a>
    );
  }

  return (
    <iframe
      src={e.url}
      style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 16 }}
      allowFullScreen
      title="Résumé vidéo"
    />
  );
}
