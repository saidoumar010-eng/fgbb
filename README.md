# FGBB — Application Fédération Guinéenne de Basketball

Application mobile (Expo / React Native) + backend Supabase pour publier scores,
résumés vidéo, statistiques (box score), classements et actualités, et programmer
les rencontres. Thème sombre « premium » aux couleurs de la Guinée.

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

Côté public : accueil, matchs (live/à venir/terminés), détail match (box score + vidéo),
**score en direct temps réel** (mise à jour instantanée sans rafraîchir), fiches joueurs,
pages clubs, classements, écran **Leaders** (meilleurs marqueurs, rebondeurs, passeurs,
interceptions, contres), actualités, recherche, équipes favorites, comptes fans,
**partage** (WhatsApp/Facebook…) des matchs et articles, tirer-pour-rafraîchir. Horaires
affichés à l'heure de la Guinée (GMT).

Espace fédération (admin) : CRUD complet joueurs / équipes / compétitions / actualités
(ajouter, modifier, supprimer), gestion des matchs (statut, score, quart-temps, vidéo),
**contrôleur de score en direct** (à la table de marque : +1/+2/+3, quart-temps, terminer),
saisie du box score joueur par joueur (manuelle **ou par photo via l'IA**), upload des photos
de joueurs / logos de clubs / couvertures d'actus (Supabase Storage, bucket `media`).

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

## Reste à faire (prochaines itérations)

- Ajouter le secret `ANTHROPIC_API_KEY` pour activer la lecture IA de la feuille de match (ci-dessus).
- Créer le projet EAS + development build pour activer la réception des push (voir ci-dessus).
- Remplacer le logo provisoire par le logo officiel de la fédération.
- Activer « Leaked password protection » dans Supabase → Auth.
