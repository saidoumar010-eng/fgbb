# FGBB — Application Fédération Guinéenne de Basketball

Application mobile (Expo / React Native) + backend Supabase pour publier scores,
résumés vidéo, statistiques (box score), classements et actualités, et programmer
les rencontres. Thème sombre « vert canard » inspiré des affiches officielles D1,
avec le logo officiel de la fédération (éléphant sur ballon tricolore).

## Lancer l'application

Les dépendances sont déjà installées. Dans le dossier `fgbb` :

```bash
npx expo start
```

Puis :
- 📱 **Sur téléphone** : installe l'app **Expo Go** (App Store / Google Play) et scanne le QR code.
- 💻 **Dans le navigateur** : appuie sur `w` dans le terminal (ou `npx expo start --web`).

## Compte administrateur (espace fédération)

Un compte admin est déjà créé pour tester la saisie des données :

- **E-mail :** `admin@fgbb.gn`
- **Mot de passe :** `FgbbAdmin2026!`

> ⚠️ Change ce mot de passe rapidement (et crée les comptes admin des vrais
> responsables de la fédération). Pour promouvoir un compte existant en admin :
> dans Supabase → SQL, exécuter
> `update public.profiles set role='admin' where id=(select id from auth.users where email='…');`

Les supporters peuvent créer un compte « fan » directement depuis l'écran Compte.

## Backend Supabase

- Projet : **FGBB** (région Paris `eu-west-3`)
- URL et clé publique : voir `.env` (déjà renseigné)
- Schéma : voir `supabase/migrations/` (équipes, joueurs, compétitions, matchs,
  box score, actualités + vues classement/moyennes + sécurité RLS).
- Sécurité : lecture publique, écriture réservée aux administrateurs (RLS).

## Structure

```
src/
  app/                  écrans (expo-router)
    (tabs)/             Accueil, Matchs, Actus, Classement, Compte
    admin/              espace fédération (tableau de bord + formulaires CRUD)
    login.tsx           connexion / inscription
  components/           UI réutilisable (cartes, boutons, champs, ligne de match…)
  lib/                  supabase, auth, types, requêtes, thème
supabase/migrations/    schéma SQL de la base
```

## Fonctionnalités

Côté public : accueil éditorial (**match à la une**, raccourcis, carrousel d'actus,
derniers résultats), matchs (live/à venir/terminés), détail match (box score + vidéo +
**fil du match en direct** action par action + **face-à-face** historique), **score en
direct temps réel** (mise à jour instantanée sans rafraîchir), fiches joueurs,
**comparateur de joueurs** (stats côte à côte), pages clubs, classements, écran
**Leaders** (marqueurs, rebondeurs, passeurs, interceptions, contres), **galerie
Vidéos** (filtrable par compétition), **fan zone** (sondages de la fédération,
**vote MVP** de chaque match, **pronostics** avant match), actualités, recherche,
équipes favorites, **joueurs suivis** (retrouvés depuis l'écran Compte), comptes
fans, **badges du supporter** (assiduité, pronostics réussis, quiz — sur le
classement des supporters), **thème clair / sombre** au choix (écran Compte),
**partage** (WhatsApp/Facebook…) des matchs et articles, tirer-pour-rafraîchir.
Horaires affichés à l'heure de la Guinée (GMT).

Espace fédération (admin) : CRUD complet joueurs / équipes / compétitions / actualités /
**sondages** (ajouter, modifier, supprimer), gestion des matchs (statut, score,
quart-temps, vidéo), **contrôleur de score en direct** (à la table de marque :
+1/+2/+3, choix du marqueur, quart-temps, terminer — chaque action alimente le fil
du match des supporters en temps réel), saisie du box score joueur par joueur
(manuelle **ou par photo via l'IA**), upload des photos de joueurs / logos de clubs /
couvertures d'actus (Supabase Storage, bucket `media`).

## Notifications push

Implémentées : Edge Function `send-push` (envoi via l'API Expo, réservée aux admins),
enregistrement du jeton de l'appareil (écran Compte → « Notifications de match »), et
envoi automatique aux abonnés quand l'admin publie un match ou une actualité.

⚠️ Pour **recevoir** les push sur un téléphone, il faut :
1. Créer un projet EAS : `npx eas init` (compte Expo requis) — ça ajoute un `projectId`.
2. Générer un *development build* : `npx eas build --profile development` (Expo Go ne reçoit
   plus les notifications push distantes). Puis installer ce build sur le téléphone.

## IA — lecture de la feuille de match

Espace admin → un match → « Saisir le box score » → bouton **« Importer une feuille
de match (IA) »** : l'admin photographie la feuille (FIBA / box score), l'image part
vers une Edge Function (`parse-match-sheet`) qui utilise **Claude (vision,
`claude-opus-4-8`)** pour extraire les statistiques et **pré-remplir automatiquement**
les joueurs reconnus (mis en correspondance avec l'effectif par nom/numéro). L'admin
vérifie et corrige, puis enregistre. Réservé aux administrateurs.

⚠️ **Pour l'activer**, ajoute ta clé Anthropic comme secret de la fonction :
1. Crée une clé sur https://console.anthropic.com (compte Anthropic + crédit requis).
2. Supabase → **Edge Functions → Manage secrets** → ajoute `ANTHROPIC_API_KEY`
   (ou en CLI : `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`).

Sans cette clé, le bouton affiche un message « ANTHROPIC_API_KEY non configurée ».

## Construire l'application Android (APK)

Tout est configuré (`eas.json`, identifiant de paquet `gn.fgbb.app`, icônes, permissions).
Il ne reste qu'à lancer le build, qui se fait sur les serveurs d'Expo :

```bash
cd C:\Users\HP\Desktop\FGBB
npx eas-cli login                                      # ton compte Expo (gratuit)
npx eas-cli init                                       # ajoute extra.eas.projectId dans app.json — à committer
npx eas-cli build --platform android --profile preview
```

À la première exécution, EAS propose de **générer un keystore** : réponds oui, il le
conserve et le réutilisera. Ce keystore signe l'application ; s'il est perdu, il devient
impossible de publier une mise à jour de la même app sur le Play Store.

Le build dure ~10 à 20 min selon la file d'attente. À la fin, EAS donne une URL de
téléchargement : ouvre-la depuis le téléphone Android et installe l'APK (il faudra
autoriser « installer des applications de sources inconnues »).

Profils disponibles (`eas.json`) :

| Profil | Résultat | Usage |
|---|---|---|
| `preview` | APK | Installation directe pour tester |
| `development` | APK + client de dev | Développement avec rechargement à chaud |
| `production` | AAB | Dépôt sur le Google Play Store |

### Ce que le build natif permet enfin de vérifier

Ces fonctions ne s'exercent pas en version web et n'ont donc **jamais été testées** :
lecteur vidéo intégré (`react-native-webview`), envoi de photos depuis la galerie,
notifications push, export PDF de la feuille de match et partage de fichier.

### Permissions demandées

Uniquement `INTERNET`, `VIBRATE` et l'accès aux photos (limité à Android 12 et
antérieurs). `RECORD_AUDIO` et `SYSTEM_ALERT_WINDOW`, ajoutées d'office par le gabarit
natif, sont explicitement bloquées : l'application n'en a pas l'usage, et ce sont des
permissions sensibles lors de la validation Google Play.

### Note sur `.env`

Le fichier est versionné volontairement : EAS n'envoie au serveur de build que les
fichiers suivis par git, et sans lui l'application serait construite sans configuration
Supabase. La clé `anon` qu'il contient est **publique par conception** (elle est
embarquée dans toute application cliente) ; ce sont les politiques RLS qui protègent
les données.

## Reste à faire (prochaines itérations)

- **Widget d'écran d'accueil** (prochain match / dernier score) : entièrement
  câblé côté Android (plugin, composant, task handler — voir
  [`WIDGET.md`](WIDGET.md)). Il ne reste qu'à lancer le build EAS puis ajouter
  le widget depuis l'écran d'accueil. (iOS/WidgetKit : non fait.)
- Lancer le premier build Android et vérifier sur un vrai téléphone (ci-dessus).
- Ajouter le secret `ANTHROPIC_API_KEY` pour activer la lecture IA de la feuille de match (ci-dessus).
- Activer « Leaked password protection » dans Supabase → Auth (tableau de bord).
- Saisir les données réelles de la saison : sans clubs ni matchs, l'application est vide.
