import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache de contenu sur le téléphone.
 *
 * La connexion mobile en Guinée est irrégulière et facturée au mégaoctet : sans
 * cache, entrer dans un gymnase sans réseau donnait une application vide, et
 * chaque retour sur l'accueil repayait le calendrier complet. On garde donc la
 * dernière réponse connue de chaque écran pour l'afficher tout de suite, quitte
 * à la corriger une seconde plus tard.
 *
 * Ce n'est pas une base locale : rien n'est écrit hors ligne, aucune
 * synchronisation différée. Uniquement de la lecture déjà vue.
 */

const PREFIX = 'fgbb.cache.';
const INDEX_KEY = 'fgbb.cache.index';

// Changer ce numéro périme tout le cache d'un coup : à incrémenter quand la
// forme des données renvoyées par `db.ts` change, sinon un ancien contenu
// serait relu dans un type qui ne l'accepte plus.
const VERSION = 1;

// Au-delà, le contenu est trop vieux pour être montré même hors ligne : un
// score de la saison dernière présenté comme actuel serait pire que rien.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Plafond du nombre d'entrées : chaque fiche joueur ou match consultée crée la
// sienne, sans quoi le stockage grossirait indéfiniment.
const MAX_ENTRIES = 80;

interface Entry<T> {
  v: number;
  at: number;
  data: T;
}

export interface CacheHit<T> {
  data: T;
  at: number;
}

function storageKey(key: string) {
  return `${PREFIX}${key}`;
}

/** Dernière réponse connue, ou null si absente, périmée ou illisible. */
export async function readCache<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.v !== VERSION) return null;
    if (Date.now() - entry.at > MAX_AGE_MS) return null;
    return { data: entry.data, at: entry.at };
  } catch {
    // Stockage plein, JSON tronqué : un cache illisible n'est pas une panne.
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: Entry<T> = { v: VERSION, at: Date.now(), data };
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
    await touchIndex(key);
  } catch {
    // Écrire le cache ne doit jamais faire échouer l'écran qui l'a demandé.
  }
}

/**
 * Tient la liste des clés, du plus ancien accès au plus récent, et supprime la
 * queue quand elle dépasse le plafond. AsyncStorage n'offre pas d'éviction :
 * sans cela, un utilisateur qui parcourt cent fiches joueur les garderait
 * toutes jusqu'à désinstaller l'application.
 */
async function touchIndex(key: string) {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const keys: string[] = raw ? (JSON.parse(raw) as string[]) : [];
  const next = [key, ...keys.filter((k) => k !== key)];
  const dropped = next.slice(MAX_ENTRIES);
  if (dropped.length) {
    await AsyncStorage.multiRemove(dropped.map(storageKey));
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)));
}

/** Vide le cache (déconnexion, ou bouton « libérer de l'espace » du compte). */
export async function clearCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const keys: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    await AsyncStorage.multiRemove([...keys.map(storageKey), INDEX_KEY]);
  } catch {
    // rien à faire : au pire les entrées expireront d'elles-mêmes
  }
}

/** Nombre d'écrans gardés en mémoire, pour l'afficher dans l'espace compte. */
export async function cacheSize(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
  } catch {
    return 0;
  }
}
