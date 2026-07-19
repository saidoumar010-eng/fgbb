// Balayage bilingue des ecrans historiques — groupe « admin1 ».
// Cle = texte francais exact affiche dans l'app.
export const EN_SWEEP_ADMIN1: Record<string, string> = {
  // Tableau de bord admin — acces rapides
  'Générer le calendrier': 'Generate schedule',

  // Tableau de bord admin — titres de sections
  Administratif: 'Administrative',
  Contenus: 'Content',
  Communauté: 'Community',
  Institution: 'Institution',

  // Tableau de bord admin — competition
  'Effectifs, logos, divisions': 'Rosters, logos, divisions',
  'Championnats, coupes, formats': 'Leagues, cups, formats',
  Saisons: 'Seasons',
  'Créer une saison, définir la saison en cours': 'Create a season, set the current one',
  'Scores, box score, vidéos, tirs': 'Scores, box scores, video, shots',
  'Générateur de calendrier': 'Schedule generator',
  'Créer toutes les journées d’une poule': 'Create every round of a group',

  // Tableau de bord admin — administratif
  // « Licences » est deja traduit dans en-federation.ts : on ne le redefinit pas.
  'Valider, suspendre, suivre les échéances': 'Approve, suspend, track expirations',
  Transferts: 'Transfers',
  'Mutations entre clubs': 'Moves between clubs',
  'Inscriptions des clubs': 'Club registrations',
  'Demandes d’engagement en compétition': 'Requests to enter a competition',
  Arbitres: 'Referees',
  'Annuaire et coordonnées': 'Directory and contact details',
  Discipline: 'Discipline',
  'Avertissements, suspensions, amendes': 'Warnings, suspensions, fines',

  // Tableau de bord admin — contenus
  Photos: 'Photos',
  'Galeries par match ou par album': 'Galleries by game or album',
  // « Agenda » est deja traduit dans en-content.ts : on ne le redefinit pas.
  'Assemblées, stages, cérémonies': 'Meetings, camps, ceremonies',
  Médiathèque: 'Media library',
  'Interviews, podcasts, reportages': 'Interviews, podcasts, features',

  // Tableau de bord admin — communaute
  'Fan zone : créer, clore, supprimer': 'Fan zone: create, close, delete',
  // « Quiz » est deja traduit dans en-fan.ts : on ne le redefinit pas.
  'Questions, bonnes réponses, activation': 'Questions, correct answers, activation',
  Modération: 'Moderation',
  'Signalements, bannissements, mots interdits': 'Reports, bans, blocked words',

  // Tableau de bord admin — institution
  Partenaires: 'Partners',
  'Sponsors affichés dans l’application': 'Sponsors shown in the app',
  'Infos fédération': 'Federation info',
  'À propos, contacts, réseaux sociaux': 'About, contacts, social media',

  // Liste des matchs
  'Matchs & stats': 'Games & stats',
  'Nouveau match': 'New game',
  'Aucun match': 'No games',
  'Crée un match pour pouvoir saisir son score et ses statistiques.':
    'Create a game to enter its score and statistics.',
  'Sans compétition': 'No competition',

  // Fiche match (admin)
  Statut: 'Status',
  Score: 'Score',
  'Score par quart-temps (domicile - extérieur)': 'Score by quarter (home - away)',
  'Lien du résumé vidéo (YouTube/Facebook)': 'Highlights link (YouTube/Facebook)',
  'Contrôle en direct (temps réel)': 'Live control (real time)',
  'Saisir les statistiques (box score)': 'Enter statistics (box score)',
  'Saisir la carte des tirs': 'Enter the shot chart',
  'Désigner les arbitres': 'Assign referees',
  'Supprimer le match': 'Delete game',
  'Match mis à jour.': 'Game updated.',
  'Cette action est irréversible.': 'This action cannot be undone.',
  'Enregistrer les modifications': 'Save changes',

  // Creation de match
  'Saisir / programmer un match': 'Enter / schedule a game',
  'Publier le match': 'Publish game',
  'Équipe à domicile': 'Home team',
  "Équipe à l'extérieur": 'Away team',
  'Score domicile': 'Home score',
  'Score extérieur': 'Away score',
  'Date & heure': 'Date & time',
  'AAAA-MM-JJ HH:MM': 'YYYY-MM-DD HH:MM',
  'Notifier les supporters': 'Notify fans',
  'Alerte aux abonnés des deux équipes': 'Alert followers of both teams',
  'Sélectionne les deux équipes.': 'Select both teams.',
  'Les deux équipes doivent être différentes.': 'The two teams must be different.',
  'Match enregistré et publié.': 'Game saved and published.',

  // Liste des joueurs
  'Ajouter un joueur': 'Add a player',
  'Aucun joueur': 'No players',

  // Fiche joueur (admin)
  'Modifier le joueur': 'Edit player',
  'Enregistrer le joueur': 'Save player',
  'Photo du joueur': 'Player photo',
  'Prénom et nom': 'First and last name',
  Numéro: 'Number',
  'Taille (cm)': 'Height (cm)',
  Poste: 'Position',
  Naissance: 'Date of birth',
  'AAAA-MM-JJ': 'YYYY-MM-DD',
  Nationalité: 'Nationality',
  Guinéenne: 'Guinean',
  'Supprimer le joueur': 'Delete player',
  'Le nom du joueur est obligatoire.': 'The player name is required.',
  'Joueur mis à jour.': 'Player updated.',
  "{name} a été ajouté à l'effectif.": '{name} has been added to the roster.',

  // Postes (theme.ts POSITIONS — traduits a l'affichage uniquement)
  Meneur: 'Point guard',
  Arrière: 'Shooting guard',
  Ailier: 'Small forward',
  'Ailier fort': 'Power forward',
  Pivot: 'Center',

  // Liste des equipes
  'Ajouter une équipe': 'Add a team',
  'Aucune équipe': 'No teams',

  // Fiche equipe (admin)
  'Modifier l’équipe': 'Edit team',
  "Enregistrer l'équipe": 'Save team',
  'Logo du club': 'Club logo',
  'Nom du club': 'Club name',
  'Ex : SLAC Conakry': 'Ex: SLAC Conakry',
  'Sigle (3 lettres)': 'Abbreviation (3 letters)',
  Ville: 'City',
  Division: 'Division',
  'Année de création': 'Year founded',
  Entraîneur: 'Head coach',
  'Nom du coach': 'Coach name',
  'Couleur du club': 'Club color',
  'Équipe nationale': 'National team',
  'Sélection (Syli National)': 'National selection (Syli National)',
  'Supprimer l’équipe': 'Delete team',
  "Le nom de l'équipe est obligatoire.": 'The team name is required.',
  'Équipe mise à jour.': 'Team updated.',
  '{name} a été enregistrée.': '{name} has been saved.',
  'Les matchs liés seront aussi supprimés. Action irréversible.':
    'Linked games will be deleted too. This cannot be undone.',
};
