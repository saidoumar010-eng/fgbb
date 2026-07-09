const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function teamShort(t?: { short_name?: string | null; name?: string | null } | null) {
  if (!t) return '—';
  if (t.short_name) return t.short_name.toUpperCase();
  return (t.name ?? '').slice(0, 3).toUpperCase();
}

// La Guinée est à l'heure GMT (UTC+0). On formate en UTC pour un affichage
// cohérent quel que soit le fuseau du téléphone.
export function matchWhen(iso?: string | null) {
  if (!iso) return { day: '', time: '' };
  const d = new Date(iso);
  return { day: DAYS[d.getUTCDay()], time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function fullDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function categoryLabel(c?: string | null) {
  switch (c) {
    case 'messieurs':
      return 'Messieurs';
    case 'dames':
      return 'Dames';
    case 'u18':
      return 'U18';
    default:
      return c ?? '';
  }
}
