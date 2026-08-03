# Widget d'écran d'accueil (prochain match / dernier score)

## État

- **Android : entièrement câblé dans le code.** Il ne reste qu'à lancer un
  *build natif* (EAS) — le widget ne fonctionne ni en web ni dans Expo Go.
- **iOS : non fait** (WidgetKit demande une extension Swift — voir plus bas).

## Ce qui est en place

Couche de données (toutes plateformes) :
- [`src/lib/widget.ts`](src/lib/widget.ts) calcule un `WidgetSnapshot`
  (prochain match + dernier résultat) depuis Supabase et le range dans
  `AsyncStorage` (`fgbb.widget.snapshot`).
- [`src/app/_layout.tsx`](src/app/_layout.tsx) rafraîchit au lancement et à
  chaque retour au premier plan, puis appelle `updateWidget()`.

Couche native Android (chargée par Metro uniquement sur Android) :
- [`app.json`](app.json) : plugin `react-native-android-widget` avec le widget
  `NextMatch` (180×110 dp, mise à jour toutes les 30 min).
- [`src/widgets/next-match-widget.tsx`](src/widgets/next-match-widget.tsx) : le
  rendu du widget (`FlexWidget` / `TextWidget`), aux couleurs de la marque.
- [`src/lib/widget-task.android.tsx`](src/lib/widget-task.android.tsx) : le
  *task handler* (tourne aussi en tâche de fond) + `updateWidget()` via
  `requestWidgetUpdate`.
- [`src/lib/widget-task.ts`](src/lib/widget-task.ts) : **no-op** pour web / iOS /
  Expo Go — c'est ce qui garde ces plateformes intactes (le natif n'entre pas
  dans leur bundle).
- [`index.js`](index.js) : point d'entrée qui démarre expo-router puis
  enregistre le task handler (`registerWidgetTask()`).

La commande `npx expo config --type introspect` confirme que le plugin génère
bien le receiver `.widget.NextMatch` dans le manifeste Android.

## Reste à faire pour l'activer (Android)

1. Construire un *development build* (ou `preview`) :
   ```bash
   npx eas build --profile preview --platform android
   ```
2. Installer l'APK, puis **ajouter le widget** « FGBB — Prochain match » depuis
   l'écran d'accueil (appui long → Widgets).

> Optionnel : fournir une image d'aperçu du widget en ajoutant
> `"previewImage": "./assets/images/…png"` dans la config du plugin.

## iOS (WidgetKit) — non fait

`react-native-android-widget` est Android uniquement. Pour iOS, il faut une
extension WidgetKit :
- Ajouter le target via [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets).
- Partager l'instantané via un **App Group** + `UserDefaults(suiteName:)`
  (écrire le JSON `fgbb.widget.snapshot` dans le groupe partagé).
- Dessiner la vue SwiftUI dans un `TimelineProvider`.

## Vérification

La couche native ne s'exécute ni en web ni en Expo Go. La couche de données
(`buildWidgetSnapshot`) est testable immédiatement.
