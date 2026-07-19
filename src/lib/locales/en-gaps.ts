// Clés repérées par l'audit `t()` → dictionnaire : chaque texte français
// effectivement affiché doit avoir sa traduction, sinon l'anglais retombe
// silencieusement sur le français et l'écran devient bilingue.
// Regénérable : voir le script d'audit décrit dans le README.
export const EN_GAPS: Record<string, string> = {
  // Statuts et étiquettes courtes, partagés par plusieurs écrans admin
  Terminé: 'Finished',
  Terminés: 'Finished',
  Fini: 'Final',
  Passé: 'Past',
  Publié: 'Published',
  Dépublier: 'Unpublish',
  Réactiver: 'Reactivate',
  Débloquer: 'Unban',
  Définitif: 'Permanent',
  Approuvé: 'Approved',
  Approuvés: 'Approved',
  Approuvée: 'Approved',
  Approuvées: 'Approved',
  Rejeté: 'Rejected',
  Rejetés: 'Rejected',
  Rejetée: 'Rejected',
  Rejetées: 'Rejected',
  Expirée: 'Expired',
  Expirées: 'Expired',
  Enregistré: 'Saved',
  Précédent: 'Previous',

  // Champs de formulaire
  Catégorie: 'Category',
  Compétition: 'Competition',
  Compétitions: 'Competitions',
  Format: 'Format',
  Début: 'Start',
  Numéro: 'Number',
  Nationalité: 'Nationality',
  Guinéenne: 'Guinean',
  Entraîneur: 'Head coach',
  Question: 'Question',
  Intitulé: 'Title',
  Légende: 'Caption',
  'Option {n}': 'Option {n}',

  // Sections et titres d'écran
  Actualités: 'News',
  Médias: 'Media',
  Médiathèque: 'Media library',
  Fédération: 'Federation',
  Modération: 'Moderation',
  Records: 'Records',
  Réactions: 'Comments',
  Progression: 'Progression',

  // Statistiques d'équipe
  Joués: 'Played',
  Défaites: 'Losses',
  Marqués: 'Scored',
  Encaissés: 'Allowed',
  Défense: 'Defence',
  Différentiel: 'Diff.',

  // Composant : face-à-face
  'Historique indisponible pour le moment.': 'History unavailable right now.',
  'Chargement du face-à-face…': 'Loading head-to-head…',
  'Première confrontation enregistrée entre ces deux équipes.':
    'First recorded meeting between these two teams.',
  'Face-à-face ({n} matchs)': 'Head-to-head ({n} games)',
  'Face-à-face ({n} match)': 'Head-to-head ({n} game)',
  victoires: 'wins',

  // Composant : fil du match
  "Pas encore d'action": 'No plays yet',
  'Le fil du match démarrera au coup d’envoi.': 'The play-by-play starts at tip-off.',
  'Les actions saisies par la table de marque apparaîtront ici.':
    'Plays entered by the scorer’s table will appear here.',
  'Correction {n}': 'Correction {n}',
  'Début du {n}e quart-temps': 'Start of Q{n}',

  // Composant : vote MVP
  'MVP du match — vote des supporters': 'Game MVP — fan vote',
  'Aucun vote pour le moment — désigne ton MVP !': 'No votes yet — pick your MVP!',
  'Se connecter pour voter': 'Sign in to vote',
  'Changer mon vote': 'Change my vote',
  'Voter pour le MVP': 'Vote for MVP',
  'Aucun joueur enregistré.': 'No players on the roster.',

  // Composant : pronostic
  'Pronostic des supporters — qui va gagner ?': 'Fan predictions — who wins?',
  'Pronostic des supporters': 'Fan predictions',
  'Sois le premier à pronostiquer !': 'Be the first to predict!',
  'Connecte-toi pour pronostiquer.': 'Sign in to make a prediction.',
  '{n} pronostics': '{n} predictions',
  '{n} pronostic': '{n} prediction',
  'ton choix est enregistré': 'your pick is saved',

  // Composant : courbe de progression
  'Progression indisponible pour le moment.': 'Progression unavailable right now.',
  'Aucun match joué pour l’instant.': 'No games played yet.',
  'Moyenne sur {n} match(s) : {v}': 'Average over {n} game(s): {v}',

  // Composant : garde-fou d'erreur
  'Une erreur est survenue': 'Something went wrong',
  Réessayer: 'Try again',
};
