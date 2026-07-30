import { useCallback, useEffect, useRef, useState } from 'react';

import { readCache, writeCache } from '@/lib/cache';

export interface FetchOptions {
  /**
   * Clé de cache. Absente, l'écran ne garde rien : c'est le bon choix pour les
   * données qui n'ont de sens qu'à l'instant présent (file de modération,
   * résultat d'un vote) ou qui ne doivent pas dormir sur le téléphone.
   *
   * Présente, elle doit contenir tous les paramètres de la requête —
   * `player:<id>`, pas `player` — sinon deux écrans se marcheraient dessus.
   */
  cacheKey?: string;
}

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Contenu venu du cache, pas encore confirmé par le serveur. */
  stale: boolean;
  /** Date du contenu affiché quand il vient du cache. */
  cachedAt: number | null;
  reload: () => Promise<void>;
}

export function useFetch<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options: FetchOptions = {},
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { cacheKey } = options;

  // Signal courant, partagé par le chargement automatique et par `reload` :
  // un rechargement manuel lancé juste avant un changement de deps doit être
  // annulé lui aussi, sinon sa réponse écrase les données du nouveau contexte.
  const current = useRef({ cancelled: false });
  // Le serveur a-t-il déjà répondu pour le contexte courant, et affiche-t-on du
  // contenu venu du cache ? Deux questions lues pendant un rendu asynchrone :
  // les garder en état obligerait à les consulter depuis une fonction de mise
  // à jour, où aucun effet de bord n'a sa place.
  const answered = useRef(false);
  const showingCache = useRef(false);

  const load = useCallback(async (signal: { cancelled: boolean }, key: string | undefined) => {
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (signal.cancelled) return;
      answered.current = true;
      showingCache.current = false;
      setData(result);
      setError(null);
      setStale(false);
      setCachedAt(null);
      if (key) void writeCache(key, result);
    } catch (e) {
      if (signal.cancelled) return;
      // Réseau absent alors qu'on affiche déjà du contenu connu : le garder en
      // le signalant vaut mieux que de le remplacer par un message d'erreur.
      if (!showingCache.current) {
        setError(e instanceof Error ? e.message : 'Erreur de chargement');
      }
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    current.current = signal;
    answered.current = false;
    showingCache.current = false;
    // Réinitialise à chaque changement de deps pour ne jamais afficher les
    // données de l'appel précédent sous les nouveaux paramètres.
    setData(null);
    setError(null);
    setStale(false);
    setCachedAt(null);

    if (cacheKey) {
      // Course volontaire : sur une bonne connexion le serveur peut répondre
      // avant le stockage. `answered` empêche alors le contenu périmé de
      // recouvrir le contenu frais déjà posé.
      void readCache<T>(cacheKey).then((hit) => {
        if (!hit || signal.cancelled || answered.current) return;
        showingCache.current = true;
        setData(hit.data);
        setCachedAt(hit.at);
        setStale(true);
        setError(null);
      });
    }

    load(signal, cacheKey);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Rechargement manuel (pull-to-refresh, après un vote) : conserve les
  // données actuelles pendant la requête pour éviter un clignotement.
  const reload = useCallback(() => load(current.current, cacheKey), [load, cacheKey]);

  return { data, loading, error, stale, cachedAt, reload };
}
