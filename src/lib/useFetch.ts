import { useCallback, useEffect, useRef, useState } from 'react';

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // Signal courant, partagé par le chargement automatique et par `reload` :
  // un rechargement manuel lancé juste avant un changement de deps doit être
  // annulé lui aussi, sinon sa réponse écrase les données du nouveau contexte.
  const current = useRef({ cancelled: false });

  // `signal` permet d'ignorer une réponse obsolète : si les deps changent
  // (ex. on sélectionne un autre joueur) avant la fin de la requête, on ne
  // veut pas écraser les nouvelles données par les anciennes.
  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (!signal.cancelled) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (!signal.cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    current.current = signal;
    // Réinitialise à chaque changement de deps pour ne jamais afficher les
    // données de l'appel précédent sous les nouveaux paramètres.
    setData(null);
    setError(null);
    load(signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Rechargement manuel (pull-to-refresh, après un vote) : conserve les
  // données actuelles pendant la requête pour éviter un clignotement.
  const reload = useCallback(() => load(current.current), [load]);

  return { data, loading, error, reload };
}
