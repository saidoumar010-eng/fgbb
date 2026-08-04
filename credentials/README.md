# credentials/

Place ici le fichier **`google-play-service-account.json`** — la clé du compte
de service Google utilisée par `eas submit` pour déposer l'AAB sur le Play Store.

⚠️ **Ce fichier est un SECRET.** Il est ignoré par git (`.gitignore`) et ne doit
**jamais** être commité, partagé ni envoyé. Ne le colle nulle part en clair.

Comment le générer : voir [`../PLAYSTORE.md`](../PLAYSTORE.md).
