// Vérifie que chaque texte français passé à t() possède bien sa traduction
// anglaise. Sans ce garde-fou, une clé oubliée retombe silencieusement sur le
// français : l'application reste fonctionnelle mais devient à moitié traduite,
// et rien — ni TypeScript ni les tests — ne le signale.
//
//   npm run i18n:audit
//
// Sortie : la liste des clés manquantes par fichier, puis un total.
// Code de sortie 1 s'il en reste, pour pouvoir l'accrocher à une CI.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Exécutable depuis n'importe quel dossier : on se place à la racine du projet.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

// Dictionnaire : clés déclarées dans les fichiers de locales.
const locDir = 'src/lib/locales';
const dict = new Set();
for (const f of fs.readdirSync(locDir)) {
  if (f === 'en.ts') continue;
  const src = fs.readFileSync(path.join(locDir, f), 'utf8');
  for (const m of src.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-zÀ-ÿ_$][A-Za-zÀ-ÿ0-9_$]*))\s*:/gm)) {
    dict.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
}

// Tous les appels t('...') du code applicatif.
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !p.includes('locales')) files.push(p);
  }
})('src');

const missing = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    const key = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!dict.has(key)) {
      if (!missing.has(f)) missing.set(f, new Set());
      missing.get(f).add(key);
    }
  }
}

let total = 0;
for (const [f, keys] of [...missing].sort()) {
  console.log(`\n${f.replace(/\\/g, '/')}  (${keys.size})`);
  for (const k of keys) {
    console.log(`    ${JSON.stringify(k)},`);
    total++;
  }
}
console.log(`\n=== ${total} cle(s) sans traduction, dans ${missing.size} fichier(s) ===`);
console.log(`=== dictionnaire : ${dict.size} entrees ===`);
process.exit(total > 0 ? 1 : 0);
