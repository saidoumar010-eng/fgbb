import { router } from 'expo-router';

/**
 * Retour arrière sûr.
 *
 * Sur le web (et après un lien profond), recharger une page laisse l'historique
 * de navigation vide : `router.back()` échoue alors avec l'avertissement
 * « The action 'GO_BACK' was not handled by any navigator ». On retombe donc sur
 * un écran de repli quand il n'y a nulle part où revenir.
 */
export function goBack(fallback = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
