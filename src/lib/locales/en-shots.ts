// Traductions anglaises du domaine « shots ».
// Cle = texte francais exact affiche dans l'app.
export const EN_SHOTS: Record<string, string> = {
  // Carte des tirs (public)
  'Carte des tirs': 'Shot chart',
  'Carte des tirs indisponible.': 'Shot chart unavailable.',
  'Aucun tir saisi pour ce match.': 'No shots recorded for this game.',
  'Les deux': 'Both',
  Tous: 'All',
  'Réussi': 'Made',
  'Manqué': 'Missed',
  '{made}/{att} · {pct}%': '{made}/{att} · {pct}%',

  // Zones (libellés renvoyés par shotZoneSummary)
  'Sous le panier': 'At the rim',
  Raquette: 'Paint',
  'Mi-distance': 'Mid-range',
  '3 points': '3-point',
  'Lancers francs': 'Free throws',

  // Graphiques
  'Pas encore de données': 'No data yet',

  // Saisie admin
  'Équipe': 'Team',
  Joueur: 'Player',
  'Résultat': 'Result',
  'Type de tir': 'Shot type',
  'Quart-temps': 'Quarter',
  Domicile: 'Home',
  'Extérieur': 'Away',
  Auto: 'Auto',
  '2 pts': '2 pts',
  '3 pts': '3 pts',
  LF: 'FT',
  'Lancer franc': 'Free throw',
  'Prol.': 'OT',
  'Prochain tir': 'Next shot',
  'Choisis un joueur pour commencer.': 'Pick a player to start.',
  'Choisis d’abord une équipe et un joueur.': 'Pick a team and a player first.',
  'Touche le terrain à l’endroit exact du tir.': 'Tap the court exactly where the shot was taken.',
  '2 ou 3 points sont déduits de la zone touchée. Force la valeur si l’action en décide autrement.':
    '2 or 3 points are inferred from the spot you tap. Override it when the play says otherwise.',
  'Aucun joueur dans cet effectif.': 'No player on this roster.',
  'Aucun joueur dans les effectifs de ces équipes. Ajoute d’abord des joueurs (Gestion → Joueurs).':
    'These teams have no players yet. Add players first (Management → Players).',
  'Le tir n’a pas pu être enregistré.': 'The shot could not be saved.',
  'Le tir n’a pas pu être supprimé.': 'The shot could not be deleted.',
  '{n} tir(s) saisi(s)': '{n} shot(s) recorded',
  'Annuler le dernier tir': 'Undo last shot',
  'Tirs saisis (du plus récent au plus ancien)': 'Recorded shots (newest first)',
  'Afficher les {n} tirs': 'Show all {n} shots',
  'Réduire la liste': 'Show less',
  'Compteur par joueur': 'Per-player count',
  'Joueur inconnu': 'Unknown player',
};
