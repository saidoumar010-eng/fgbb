// Couche widget — variante par défaut (web, iOS, Expo Go). Le widget d'écran
// d'accueil est propre à Android ; Metro charge widget-task.android.tsx sur
// Android et ce fichier partout ailleurs. Les deux exportent la même surface,
// pour que le reste du code appelle registerWidgetTask() / updateWidget() sans
// se soucier de la plateforme.

export function registerWidgetTask(): void {
  // Aucun widget natif hors Android.
}

export async function updateWidget(): Promise<void> {
  // Aucun widget natif hors Android.
}
