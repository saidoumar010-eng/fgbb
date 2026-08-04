# Dépôt sur le Google Play Store (`eas submit`)

La config `eas submit` est prête ([`eas.json`](eas.json) → `submit.production`) :

```json
"android": {
  "serviceAccountKeyPath": "./credentials/google-play-service-account.json",
  "track": "internal",
  "releaseStatus": "draft"
}
```

Il ne reste qu'à **générer la clé du compte de service** (étapes ci-dessous, à
faire une seule fois) puis à lancer `eas submit`.

> ⚠️ La clé JSON est un **secret**. Elle va dans `credentials/` qui est ignoré
> par git. Ne la commite jamais.

## Prérequis (à faire par toi, une fois)

1. **Compte Google Play Console** (~25 $ une fois) : https://play.google.com/console
2. **Créer l'application** dans la Play Console (package `gn.fgbb.app`).
3. Renseigner les obligations Play : fiche du store (description, icône,
   captures), **politique de confidentialité** (URL), classification du contenu,
   public cible, section « Sécurité des données ».

## Générer la clé du compte de service Google

1. Play Console → **Configuration → Accès à l'API** (Setup → API access).
2. Lie (ou crée) un **projet Google Cloud**.
3. Dans Google Cloud → **IAM & Admin → Comptes de service** → *Créer un compte
   de service* (ex. `eas-submit`).
4. Sur ce compte → onglet **Clés → Ajouter une clé → Créer → JSON** → télécharge
   le fichier `.json`.
5. De retour dans **Play Console → Accès à l'API → Gérer les autorisations** du
   compte de service : accorde au minimum **« Gérer les versions »** (Release
   manager) sur l'application.
6. Renomme le fichier téléchargé en **`google-play-service-account.json`** et
   place-le dans le dossier **`credentials/`** de ce dépôt.

Détails officiels : https://docs.expo.dev/submit/android/#creating-a-google-service-account

## Déposer l'AAB

Une fois la clé en place :

```bash
cd C:\Users\HP\Desktop\FGBB
npx eas-cli submit --platform android --profile production --latest
```

- `--latest` prend le dernier build AAB réussi. (Ou `--id <buildId>` pour cibler
  un build précis, ou `--path chemin.aab` pour un fichier local.)
- Avec la config actuelle : dépôt sur la piste **`internal`** (test interne) en
  **`draft`** (rien n'est publié tant que tu ne valides pas dans la console).

## Passer en production (quand tu es prêt)

Dans [`eas.json`](eas.json), profil `submit.production.android` :

- `"track": "production"` pour la piste publique (au lieu de `internal`).
- `"releaseStatus": "completed"` pour publier réellement (au lieu de `draft`).

> La 1re mise en ligne d'un nouveau compte Play passe souvent d'abord par une
> piste de **test** avant d'autoriser la production — garde `internal` pour
> valider la chaîne, puis promeus depuis la console ou change le `track`.

## Note keystore / signature

Les builds EAS de cette app utilisent tous le **même keystore** (géré par EAS,
`Build Credentials 1PIVfnkZi9`). À la 1re mise en ligne, active **Play App
Signing** : Google gère la clé d'app finale, et ce keystore EAS devient la
« clé de téléversement ». Ne perds pas l'accès EAS à ce keystore.
