const DAYS_FR = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];
const MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Les dates sont formatées dans une centaine d'endroits, souvent hors composant
// React (helpers, tri, export). Plutôt que de faire passer la langue en
// paramètre partout, le fournisseur d'i18n la dépose ici pendant son rendu :
// les écrans se re-rendent quand elle change, donc ils relisent la bonne valeur.
let dateLang: 'fr' | 'en' = 'fr';

export function setDateLang(l: 'fr' | 'en') {
  dateLang = l;
}

function days() {
  return dateLang === 'en' ? DAYS_EN : DAYS_FR;
}
function months() {
  return dateLang === 'en' ? MONTHS_EN : MONTHS_FR;
}

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
  return { day: days()[d.getUTCDay()], time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function fullDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.getUTCDate();
  const month = months()[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  // L'anglais place le mois avant le quantième : « 12 mars 2026 » → « Mar 12, 2026 ».
  return dateLang === 'en' ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
}

export function categoryLabel(c?: string | null) {
  const en = dateLang === 'en';
  switch (c) {
    case 'messieurs':
      return en ? 'Men' : 'Messieurs';
    case 'dames':
      return en ? 'Women' : 'Dames';
    case 'u18':
      return 'U18';
    default:
      return c ?? '';
  }
}
