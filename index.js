// Point d'entrée de l'application.
//
// On démarre expo-router (registerRootComponent) PUIS on enregistre le handler
// de tâche du widget Android. Sur les autres plateformes, registerWidgetTask
// est un no-op (voir src/lib/widget-task.ts), donc ce fichier est sûr partout.
import 'expo-router/entry';

import { registerWidgetTask } from './src/lib/widget-task';

registerWidgetTask();
