-- Genre d'une équipe : masculine (messieurs) ou féminine (dames).
--
-- Chaque club ou sélection peut être rattaché à un genre. Choix binaire : une
-- équipe est masculine ou féminine. Les valeurs reprennent le vocabulaire de la
-- catégorie des compétitions (competitions.category), dont c'est un sous-ensemble.
--
-- Migration purement additive : colonne nullable, aucune donnée existante
-- n'est modifiée. Les équipes déjà créées restent « non précisé » (null).

alter table public.teams
  add column if not exists gender text
  check (gender in ('messieurs', 'dames'));

comment on column public.teams.gender is
  'Genre de l''équipe : messieurs (masculine) | dames (féminine). Null = non précisé.';
