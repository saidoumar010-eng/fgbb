// Traductions anglaises du domaine « content » : galeries photo, agenda de la
// fédération et médiathèque. La clé est le texte français exact affiché.
export const EN_CONTENT: Record<string, string> = {
  // Communs
  'Chargement…': 'Loading…',
  'Erreur de chargement': 'Loading error',
  'Cette action est irréversible.': 'This action cannot be undone.',
  Annuler: 'Cancel',
  Supprimer: 'Delete',
  'Enregistrer les modifications': 'Save changes',
  'AAAA-MM-JJ': 'YYYY-MM-DD',
  Titre: 'Title',
  Description: 'Description',
  Catégorie: 'Category',
  Lieu: 'Venue',
  Heure: 'Time',
  Début: 'Start',
  Type: 'Type',
  Lien: 'Link',
  Tout: 'All',
  Match: 'Game',
  Ouvrir: 'Open',
  Enregistré: 'Saved',
  Passé: 'Past',

  // Mois (agenda)
  Janvier: 'January',
  Février: 'February',
  Mars: 'March',
  Avril: 'April',
  Mai: 'May',
  Juin: 'June',
  Juillet: 'July',
  Août: 'August',
  Septembre: 'September',
  Octobre: 'October',
  Novembre: 'November',
  Décembre: 'December',

  // Jours abrégés (agenda)
  'Dim.': 'Sun',
  'Lun.': 'Mon',
  'Mar.': 'Tue',
  'Mer.': 'Wed',
  'Jeu.': 'Thu',
  'Ven.': 'Fri',
  'Sam.': 'Sat',

  // Catégories d'événement
  Fédération: 'Federation',
  Compétition: 'Competition',
  Formation: 'Training',
  Cérémonie: 'Ceremony',
  Autre: 'Other',

  // Types de média
  Interview: 'Interview',
  Interviews: 'Interviews',
  Podcast: 'Podcast',
  Podcasts: 'Podcasts',
  Reportage: 'Feature',
  Reportages: 'Features',
  Vidéo: 'Video',
  Vidéos: 'Videos',
  Média: 'Media',

  // Galeries photo
  Photos: 'Photos',
  Album: 'Album',
  'Aucune photo': 'No photos yet',
  'Les galeries publiées par la fédération apparaîtront ici.':
    'Photo galleries published by the federation will appear here.',
  '{n} photos': '{n} photos',
  '{n} sur {total}': '{n} of {total}',
  'Photo : {credit}': 'Photo: {credit}',
  Précédent: 'Previous',
  Suivant: 'Next',

  // Agenda public
  Agenda: 'Calendar',
  'Aucun événement': 'No events',
  'Les rendez-vous de la fédération apparaîtront ici.':
    'The federation’s upcoming dates will appear here.',
  'Aucun événement à venir pour le moment.': 'No upcoming events for now.',
  'Événements passés ({n})': 'Past events ({n})',
  'Jusqu’au {date}': 'Until {date}',

  // Médiathèque publique
  Médiathèque: 'Media library',
  'Aucun média': 'No media yet',
  'Les contenus publiés par la fédération apparaîtront ici.':
    'Content published by the federation will appear here.',
  '{n} min': '{n} min',

  // Admin — photos
  'Nom de l’album': 'Album name',
  'Finale 2026': '2026 Final',
  'Match photographié': 'Photographed game',
  'Envoyer des photos': 'Upload photos',
  '{n} photo(s) envoyée(s).': '{n} photo(s) uploaded.',
  'Choisis une destination': 'Pick a destination',
  'Ouvre un album existant, saisis un nouveau nom, ou sélectionne un match.':
    'Open an existing album, type a new name, or pick a game.',
  'Galerie vide': 'Empty gallery',
  'Envoie les premières photos de cette galerie.': 'Upload the first photos of this gallery.',
  'Supprimer la photo': 'Delete photo',
  Légende: 'Caption',
  'Ce que montre la photo': 'What the photo shows',
  'Crédit photo': 'Photo credit',
  'Nom du photographe': 'Photographer name',

  // Admin — agenda
  'Crée les rendez-vous de la fédération : assemblées, tournois, formations.':
    'Create the federation’s dates: assemblies, tournaments, training courses.',
  'Nouvel événement': 'New event',
  'Modifier l’événement': 'Edit event',
  'Enregistrer l’événement': 'Save event',
  'Supprimer l’événement': 'Delete event',
  'Événement mis à jour.': 'Event updated.',
  'L’événement {title} a été ajouté à l’agenda.': '{title} has been added to the calendar.',
  'Le titre de l’événement est obligatoire.': 'The event title is required.',
  'Indique une date de début au format AAAA-MM-JJ.': 'Enter a start date in YYYY-MM-DD format.',
  'La date de fin doit être au format AAAA-MM-JJ.': 'The end date must use the YYYY-MM-DD format.',
  'La date de fin précède la date de début.': 'The end date comes before the start date.',
  Visuel: 'Cover image',
  'Assemblée générale ordinaire': 'Ordinary general assembly',
  'Fin (facultatif)': 'End (optional)',
  'Palais des Sports, Conakry': 'Palais des Sports, Conakry',
  'Programme et informations pratiques': 'Programme and practical information',

  // Admin — médiathèque
  'Ajoute les interviews, podcasts, reportages et vidéos de la fédération.':
    'Add the federation’s interviews, podcasts, features and videos.',
  'Nouveau média': 'New media item',
  'Modifier le média': 'Edit media item',
  'Publier le média': 'Publish media item',
  'Supprimer le média': 'Delete media item',
  'Média mis à jour.': 'Media item updated.',
  '{title} a été publié dans la médiathèque.': '{title} has been published in the media library.',
  'Le titre du média est obligatoire.': 'The media title is required.',
  'Le lien du média est obligatoire.': 'The media link is required.',
  'Indique une date de publication au format AAAA-MM-JJ.':
    'Enter a publication date in YYYY-MM-DD format.',
  'Entretien avec le sélectionneur national': 'Interview with the national head coach',
  Vignette: 'Thumbnail',
  'Sans vignette, celle de YouTube sera utilisée automatiquement.':
    'Without a thumbnail, the YouTube one is used automatically.',
  'Durée (min)': 'Duration (min)',
  Publication: 'Publication date',
  'Résumé du contenu': 'Summary of the content',
};
