import { useCallback, useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

// Compteur global : garantit un nom de canal unique par abonnement,
// sinon Supabase refuse d'ajouter un 2e écouteur au même canal déjà abonné.
let channelSeq = 0;

/**
 * Regroupe les rafales d'événements avant de rappeler.
 *
 * Pendant un match, la table est écrite à chaque panier : sans ce délai, chaque
 * appui sur « +2 » du côté de la fédération déclenchait un rechargement complet
 * du calendrier sur tous les téléphones connectés à la fois.
 */
function useDebounced(fn: () => void, delay: number) {
  const cb = useRef(fn);
  cb.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      cb.current();
    }, delay);
  }, [delay]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return trigger;
}

// Abonne aux mises à jour d'un match précis (score en direct).
export function useMatchRealtime(matchId: string | undefined, onUpdate: (row: Record<string, unknown>) => void) {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  useEffect(() => {
    if (!matchId) return;
    const name = `match-${matchId}-${++channelSeq}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => cb.current(payload.new as Record<string, unknown>),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);
}

// Abonne au fil d'événements d'un match (play-by-play en direct).
export function useMatchEventsRealtime(matchId: string | undefined, onChange: () => void) {
  const ping = useDebounced(onChange, 400);
  useEffect(() => {
    if (!matchId) return;
    const name = `events-${matchId}-${++channelSeq}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        () => ping(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, ping]);
}

// Abonne à tout changement sur les matchs (pour rafraîchir les listes live).
export function useMatchesRealtime(onChange: () => void) {
  // Une liste complète coûte cher à recharger : on laisse passer la rafale de
  // paniers d'un match en direct avant de redemander le calendrier.
  const ping = useDebounced(onChange, 1500);
  useEffect(() => {
    const name = `matches-all-${++channelSeq}`;
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => ping())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ping]);
}
