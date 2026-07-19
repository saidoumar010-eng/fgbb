import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import { toEmbed } from '@/lib/video';

export function VideoEmbed({ url }: { url?: string | null }) {
  const { t } = useT();
  const e = toEmbed(url);
  if (!e) return null;

  if (e.type === 'link') {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontSize: 14 }}>
        {t('Ouvrir le résumé vidéo')}
      </a>
    );
  }

  return (
    <iframe
      src={e.url}
      style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 16 }}
      allowFullScreen
      title={t('Résumé vidéo')}
    />
  );
}
