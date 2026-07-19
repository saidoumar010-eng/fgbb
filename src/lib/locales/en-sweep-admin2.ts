// Balayage bilingue des ecrans historiques — groupe « admin2 ».
// Cle = texte francais exact affiche dans l'app.
export const EN_SWEEP_ADMIN2: Record<string, string> = {
  // Garde d'acces (admin/_layout)
  'Accès réservé': 'Restricted access',
  "Ton compte n'a pas les droits d'administration de la fédération.":
    'Your account does not have federation admin rights.',

  // Compétitions
  'Créer une compétition': 'Create a competition',
  'Aucune compétition': 'No competitions',
  'Modifier la compétition': 'Edit competition',
  'Créer la compétition': 'Create competition',
  'Supprimer la compétition': 'Delete competition',
  'Le nom de la compétition est obligatoire.': 'The competition name is required.',
  'Compétition mise à jour.': 'Competition updated.',
  'Compétition « {name} » créée.': 'Competition “{name}” created.',
  Championnat: 'League',
  Coupe: 'Cup',
  Tournoi: 'Tournament',
  Messieurs: 'Men',
  Dames: 'Women',
  'Ex : Ligue 1 Messieurs 2026': 'e.g. Ligue 1 Men 2026',
  '8 équipes': '8 teams',

  // Actualités
  'Publier une actualité': 'Publish an article',
  'Aucune actualité': 'No articles',
  'Modifier l’actualité': 'Edit article',
  'Supprimer l’actualité': 'Delete article',
  'Le titre est obligatoire.': 'The title is required.',
  'Actualité mise à jour.': 'Article updated.',
  'Actualité publiée.': 'Article published.',
  'Image de couverture': 'Cover image',
  "Titre de l'article": 'Article title',
  'Rédige le communiqué…': 'Write the press release…',
  'Service communication': 'Communications office',
  'Notifier les supporters': 'Notify fans',
  'Alerte à tous les abonnés': 'Alert to all subscribers',
  Officiel: 'Official',
  Sélection: 'National team',

  // Sondages
  'Nouveau sondage': 'New poll',
  'Aucun sondage': 'No polls',
  'Publier le sondage': 'Publish poll',
  'Supprimer le sondage': 'Delete poll',
  'Les votes associés seront également supprimés.': 'The related votes will be deleted as well.',
  'Renseigne une question et au moins deux options.': 'Enter a question and at least two options.',
  'Ex. Quelle équipe remportera la D1 ?': 'e.g. Which team will win the D1?',
  'Réponse {n}': 'Answer {n}',
  'Ajouter une option': 'Add an option',
  'Clore le sondage': 'Close poll',
  Réactiver: 'Reopen',
  Actif: 'Active',
  Clos: 'Closed',

  // Contrôle en direct
  'Contrôle en direct': 'Live control',
  'Terminer le match': 'End game',
  Terminer: 'Finish',
  'Le score sera figé et le match marqué comme terminé.':
    'The score will be locked and the game marked as finished.',
  '{n}e quart-temps': 'Quarter {n}',
  'Prolongation {n}': 'Overtime {n}',
  'Enregistré ✓': 'Saved ✓',
  'Les changements sont enregistrés automatiquement': 'Changes are saved automatically',
  'Quart-temps suivant →': 'Next quarter →',
  'Marqueur (optionnel)': 'Scorer (optional)',
  '− 1 (corriger)': '− 1 (fix)',
  'Erreur fil du match': 'Game feed error',

  // Box score (saisie)
  'Saisir le box score': 'Enter box score',
  'Enregistrer le box score': 'Save box score',
  'Importer une feuille de match (IA)': 'Import a match sheet (AI)',
  'Photographie la feuille de match : l’IA lit les statistiques et pré-remplit les joueurs reconnus. Vérifie toujours les chiffres avant d’enregistrer.':
    'Take a photo of the match sheet: the AI reads the stats and pre-fills the players it recognises. Always check the numbers before saving.',
  'MIN minutes · PTS points · REB rebonds (RO offensifs) · PD passes · INT interceptions · CTR contres · BP balles perdues · FTE fautes · TR/TT tirs réussis/tentés · 3R/3T à 3 points · LFR/LFT lancers francs · +/− différentiel (un nombre négatif est accepté)':
    'MIN minutes · PTS points · REB rebounds (OREB offensive) · AST assists · STL steals · BLK blocks · TO turnovers · PF fouls · FGM/FGA field goals made/attempted · 3PM/3PA three-pointers · FTM/FTA free throws · +/− plus-minus (a negative number is accepted)',
  'Aucun joueur dans les effectifs de ces équipes. Ajoute d’abord des joueurs (Gestion → Joueurs).':
    'No players on these teams’ rosters. Add players first (Management → Players).',
  '{n} joueur(s) pré-remplis depuis la feuille.': '{n} player(s) pre-filled from the sheet.',
  'Non reconnus : {names}': 'Not recognised: {names}',
  'Vérifie les chiffres puis enregistre.': 'Check the numbers, then save.',
  "Échec de l'analyse de la feuille de match.": 'Could not read the match sheet.',
  'Saisis les statistiques d’au moins un joueur.': 'Enter stats for at least one player.',
  'Statistiques enregistrées pour {n} joueur(s).': 'Statistics saved for {n} player(s).',

  // Abreviations du box score (la constante FIELDS reste en francais)
  RO: 'OREB',
  FTE: 'PF',
  TR: 'FGM',
  TT: 'FGA',
  '3R': '3PM',
  '3T': '3PA',
  LFR: 'FTM',
  LFT: 'FTA',

  // Libelles de formulaire
  Nom: 'Name',
  Titre: 'Title',
  Contenu: 'Content',
  Auteur: 'Author',
  Catégorie: 'Category',
  'Enregistrer les modifications': 'Save changes',
  'Action irréversible.': 'This cannot be undone.',
  Erreur: 'Error',
  'Erreur : {msg}': 'Error: {msg}',
};
