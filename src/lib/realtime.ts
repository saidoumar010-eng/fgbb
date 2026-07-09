import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

// Compteur global : garantit un nom de canal unique par abonnement,
// sinon Supabase refuse d'ajouter un 2e écouteur au même canal déjà abonné.
let channelSeq = 0;

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

// Abonne à tout changement sur les matchs (pour rafraîchir les listes live).
export function useMatchesRealtime(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const name = `matches-all-${++channelSeq}`;
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => cb.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
