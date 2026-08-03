# Widget d'écran d'accueil (prochain match / dernier score)

L'application prépare déjà les **données** du widget ; il reste à ajouter la
**couche native**, qui ne fonctionne qu'avec un *build natif* (EAS), pas dans
Expo Go ni sur le web.

## Ce qui est déjà en place (côté JS)

- [`src/lib/widget.ts`](src/lib/widget.ts) calcule un instantané
  `WidgetSnapshot` (prochain match programmé + dernier résultat) à partir des
  matchs Supabase, et le range dans `AsyncStorage` sous la clé
  `fgbb.widget.snapshot`.
- [`src/app/_layout.tsx`](src/app/_layout.tsx) appelle `refreshWidgetData()` au
  lancement **et à chaque retour au premier plan** de l'app.

Un widget natif n'a donc qu'à lire l'instantané et le dessiner.

## Android — `react-native-android-widget` (recommandé)

C'est la voie la plus simple avec Expo (config plugin + rendu du widget en JS).

1. Installer :
   ```bash
   npx expo install react-native-android-widget
   ```
2. Ajouter le plugin dans `app.json` (`expo.plugins`) avec la définition du
   widget (nom, tailles, aperçu). Voir la doc du paquet.
3. Créer le composant du widget (JSX propre au paquet, à NE PAS importer depuis
   le code de l'app pour ne pas casser le web) :
   ```tsx
   // widgets/NextMatchWidget.tsx  (chargé uniquement par le handler natif)
   import { FlexWidget, TextWidget } from 'react-native-android-widget';
   import type { WidgetSnapshot } from '@/lib/widget';

   export function NextMatchWidget({ snap }: { snap: WidgetSnapshot | null }) {
     const next = snap?.next;
     const last = snap?.last;
     return (
       <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#06201C', borderRadius: 16, padding: 12 }}>
         <TextWidget text="FGBB" style={{ fontSize: 12, color: '#3BD61B' }} />
         {next ? (
           <TextWidget text={`${next.homeShort} vs ${next.awayShort}`} style={{ fontSize: 16, color: '#F2F7F5' }} />
         ) : (
           <TextWidget text="Aucun match à venir" style={{ fontSize: 14, color: '#92ACA5' }} />
         )}
         {last ? (
           <TextWidget text={`Dernier : ${last.homeShort} ${last.homeScore}–${last.awayScore} ${last.awayShort}`} style={{ fontSize: 12, color: '#92ACA5' }} />
         ) : null}
       </FlexWidget>
     );
   }
   ```
4. Enregistrer le *widget task handler* (dans `index.js` / point d'entrée
   natif) : il lit l'instantané via `readWidgetData()` puis rend le composant.
   Rafraîchir depuis l'app avec `requestWidgetUpdate(...)` à la fin de
   `refreshWidgetData` (à ajouter derrière un `Platform.OS === 'android'`).
5. Construire un *development build* pour tester :
   ```bash
   npx eas build --profile development --platform android
   ```

## iOS — WidgetKit

Plus lourd : il faut une *extension* Swift (target WidgetKit). Pistes :

- Ajouter le target via [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets)
  (config plugin) pour ne pas quitter le flux Expo.
- Partager l'instantané avec l'extension via un **App Group** + un
  `UserDefaults(suiteName:)` : écrire le JSON `fgbb.widget.snapshot` dans le
  groupe partagé (un petit module natif ou `expo-shared-preferences` côté RN),
  le lire en Swift dans le `TimelineProvider`.
- Dessiner la vue SwiftUI (prochain match + dernier score).

## Vérification

Aucune de ces couches ne s'exécute en web ni en Expo Go : elles se testent
seulement sur un *development build* installé sur un téléphone. La couche JS
(`buildWidgetSnapshot`) est, elle, testable immédiatement.
