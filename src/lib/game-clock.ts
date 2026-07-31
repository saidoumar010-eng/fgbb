import { useEffect, useState } from 'react';

/**
 * Chronomètre de match.
 *
 * Le compte à rebours n'est jamais écrit seconde par seconde. La base retient
 * trois choses — le temps restant au moment de la dernière décision, si le
 * chrono tourne, et quand cette décision a été prise — et chaque téléphone en
 * déduit la seconde courante. Une écriture par action de la table de marque au
 * lieu d'une par seconde : c'est ce qui rend le direct tenable sur un forfait
 * mobile et sur le quota gratuit de Supabase.
 *
 * Conséquence voulue : l'affichage reste juste même si un supporter ouvre la
 * page en cours de quart-temps, et même si sa connexion a sauté un moment.
 */

/** Durée réglementaire FIBA : 10 min par quart-temps, 5 min par prolongation. */
export function periodSeconds(quarter: number | null | undefined) {
  return (quarter ?? 1) <= 4 ? 600 : 300;
}

export interface ClockState {
  clock_seconds: number;
  clock_running: boolean;
  clock_updated_at: string | null;
}

/**
 * Secondes restantes à l'instant `now`. Bornée à zéro : un chrono laissé en
 * marche après la fin d'un quart-temps ne doit pas afficher un temps négatif.
 */
export function remainingSeconds(state: ClockState, now = Date.now()) {
  if (!state.clock_running || !state.clock_updated_at) {
    return Math.max(0, state.clock_seconds);
  }
  const elapsed = (now - new Date(state.clock_updated_at).getTime()) / 1000;
  return Math.max(0, Math.round(state.clock_seconds - elapsed));
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  // Sous la minute, les tables de marque affichent les dixièmes ; on s'en tient
  // à la seconde, que le chrono officiel de la salle reste la référence.
  return `${m}:${rest < 10 ? '0' : ''}${rest}`;
}

/**
 * Secondes restantes, rafraîchies chaque seconde tant que le chrono tourne.
 * À l'arrêt, aucun minuteur n'est armé : rien ne tourne pour rien.
 *
 * L'instant courant est tenu dans un état React et passé explicitement à
 * `remainingSeconds`. Ce n'est pas une coquetterie : le projet active le
 * compilateur React (`reactCompiler` dans app.json), qui mémoïse les calculs
 * de rendu d'après leurs dépendances visibles. Un `Date.now()` lu à l'intérieur
 * de la fonction lui est invisible — il gardait le premier résultat en cache et
 * le chrono restait figé à l'écran alors que le minuteur tournait. Toute valeur
 * qui dépend de l'heure doit donc entrer par un état, jamais être lue au vol
 * pendant le rendu.
 */
export function useGameClock(state: ClockState | null | undefined) {
  const running = !!state?.clock_running;
  const seconds = state?.clock_seconds;
  const updatedAt = state?.clock_updated_at;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Resynchronise dès que la table de marque change quelque chose, puis
    // n'arme un minuteur que si le chrono tourne vraiment.
    setNow(Date.now());
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, seconds, updatedAt]);

  if (!state) return 0;
  return remainingSeconds(state, now);
}

/** Bonus FIBA : à partir de la 5e faute d'équipe, l'adversaire tire des lancers francs. */
export const BONUS_FOULS = 5;

/** Temps morts accordés : 2 en première mi-temps, 3 en seconde (prolongations comprises). */
export function timeoutsAllowed(quarter: number | null | undefined) {
  return (quarter ?? 1) <= 2 ? 2 : 3;
}

/** La seconde mi-temps commence au 3e quart-temps : temps morts remis à zéro. */
export function isHalftimeBoundary(from: number, to: number) {
  return from <= 2 && to >= 3;
}
