# Site vitrine FGBB

Site web de présentation de l'application **FGBB — Fédération Guinéenne de
Basket-Ball**, à publier en attendant la sortie sur le Google Play Store.

Il sert aussi à fournir les **URL légales exigées par Google Play** :
politique de confidentialité et page de suppression de compte.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil (présentation, fonctionnalités, pour qui, aperçu, fédération) |
| `app.html` · `app.js` · `app.css` | **Application web fonctionnelle** : connexion / création de compte + matchs, classement, actus et leaders en direct |
| `confidentialite.html` | Politique de confidentialité — **URL à fournir dans la Play Console** |
| `suppression-compte.html` | Demande de suppression de compte — **URL à fournir dans la Play Console** |
| `support.html` | Aide, FAQ et contact |
| `styles.css` | Feuille de style partagée (thème « vert canard » de l'app) |
| `assets/` | Logos et favicon (copiés depuis `assets/images/`) |

Les **pages vitrine** (`index`, `confidentialite`, `suppression-compte`,
`support`) sont 100 % statiques et fonctionnent même hors-ligne.

## L'application web (`app.html`)

`app.html` est une **vraie application** qui se connecte au **même backend
Supabase que l'app mobile** : matchs, scores en direct, classements, leaders et
actualités sont lus en temps réel, et un compte supporter créé ici **fonctionne
aussi dans l'app mobile** (et inversement).

- **Connexion / inscription** : bouton « Se connecter » et « Créer un compte »
  (modale), branchés sur `supabase.auth` — mêmes comptes que l'app.
- **Lecture publique** : les données sportives s'affichent sans connexion
  (politiques RLS de Supabase, comme sur mobile). La connexion sert au compte
  supporter.
- **Dépendances** : `app.html` a besoin d'une **connexion internet** — il charge
  le client `@supabase/supabase-js` depuis un CDN (jsDelivr) et interroge
  Supabase. (Les pages vitrine, elles, restent autonomes.)
- **Clé Supabase** : `app.js` contient l'URL du projet et la clé *publishable*
  (anon). Elle est **publique par conception** — exactement comme dans l'app
  mobile (`.env`) — et embarquée dans tout client. Ce sont les politiques RLS qui
  protègent les données, pas le secret de cette clé.

> Si un jour vous **régénérez** les clés Supabase, mettez à jour `SUPABASE_URL`
> et `SUPABASE_ANON_KEY` en haut de `app.js`.

## Prévisualiser en local

Ouvrez simplement `index.html` dans un navigateur, ou servez le dossier :

```bash
cd website
npx serve .
```

## Déployer (choisir une option)

### GitHub Pages
1. Poussez ce dossier `website/` sur GitHub.
2. Dépôt → **Settings → Pages** → source = branche + dossier `/website` (ou placez le contenu à la racine d'une branche `gh-pages`).
3. L'URL publique sera de la forme `https://<compte>.github.io/<repo>/`.

### Netlify (recommandé — config déjà prête)
Un fichier [`netlify.toml`](../netlify.toml) est présent à la racine du dépôt :
il publie automatiquement le dossier `website/`. Aucun réglage manuel.
1. Sur [Netlify](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Connectez ce dépôt GitHub → **Deploy**. C'est tout.
   *(Ou, sans Git : glissez-déposez le dossier `website/` sur Netlify Drop.)*

### Vercel (config déjà prête)
Un fichier [`vercel.json`](../vercel.json) à la racine sert le dossier `website/`.
1. Sur [Vercel](https://vercel.com) → **Add New → Project** → importez ce dépôt.
2. Laissez les réglages par défaut → **Deploy** (le `vercel.json` s'occupe du reste).

### Cloudflare Pages
- Reliez le dépôt · **Build output directory** : `website` · **Build command** : *(aucune)*.

### Nom de domaine
Idéalement un domaine propre, ex. `fgbb.gn` ou `app.fgbb.gn`, à faire pointer
vers l'hébergeur choisi.

## À personnaliser avant publication

- **Coordonnées de contact** : e-mails `infos@feguiba.org` et
  `Soleilsarlbtp@gmail.com`, téléphone `+224 626 88 83 33` (présents dans
  `confidentialite.html`, `suppression-compte.html`, `support.html` et le pied de
  page de `index.html`).
- **Réseaux sociaux** : les liens Facebook / YouTube / Instagram du pied de page
  de `index.html` pointent vers `#` — mettez les vraies URL.
- **Lien Google Play** : une fois l'app publiée, remplacez les badges
  « Bientôt sur Google Play » (`href="#telecharger"`) par le lien réel
  `https://play.google.com/store/apps/details?id=gn.fgbb.app`.
- **Dates / mentions** : la date de la politique de confidentialité est au
  17 août 2026 ; ajustez-la à la vraie date de mise en ligne.

## Play Store — rappel

Dans la Play Console (fiche du store), renseignez :
- **Politique de confidentialité** → URL de `confidentialite.html`
- **Suppression de compte** (section « Sécurité des données ») → URL de
  `suppression-compte.html`
