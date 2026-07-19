// Balayage bilingue des ecrans historiques — groupe « detail ».
// Cle = texte francais exact affiche dans l'app.
export const EN_SWEEP_DETAIL: Record<string, string> = {
  // Fiche match — src/app/match/[id].tsx
  "Suivez le basket guinéen sur l'application FGBB.": 'Follow Guinean basketball on the FGBB app.',
  "Export impossible pour l'instant.": 'Export unavailable right now.',
  Chat: 'Chat',
  Réactions: 'Reactions',
  'Pas encore de statistiques': 'No statistics yet',
  'Les stats joueur par joueur seront saisies par la fédération.':
    'Player-by-player stats will be entered by the federation.',
  Stat: 'Stat',

  // Fiche joueur — src/app/player/[id].tsx
  '{n} ans': '{n} yrs',
  Passes: 'Assists',
  'Intercep.': 'STL',
  '% tirs': 'FG%',
  '% 3 pts': '3P%',
  'Aucune statistique enregistrée.': 'No statistics recorded.',
  Adversaire: 'Opponent',
  Évolution: 'Progression',

  // Fiche club — src/app/team/[id].tsx
  'Club introuvable': 'Club not found',
  'Fondé en {y}': 'Founded in {y}',
  Joués: 'Played',
  'Moyennes par match': 'Per game averages',
  Marqués: 'Scored',
  Encaissés: 'Allowed',
  Record: 'Best',
  "Aucun joueur dans l'effectif.": 'No player on the roster.',
  'Aucun match programmé.': 'No scheduled game.',

  // Fiche actualité — src/app/article/[id].tsx
  "À lire sur l'application FGBB.": 'Read it on the FGBB app.',
  Article: 'Article',
  '(Pas de contenu)': '(No content)',
};
