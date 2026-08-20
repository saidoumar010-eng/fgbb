-- Genre / catégorie d'une équipe : féminine (dames) ou masculine (messieurs).
--
-- Chaque club ou sélection est désormais rattaché à une catégorie de genre,
-- au même vocabulaire que la catégorie des compétitions ('messieurs'/'dames',
-- 'mixte' autorisé pour rester cohérent avec competitions.category).
--
-- Migration purement additive : colonne nullable, aucune donnée existante
-- n'est modifiée. Les équipes déjà créées restent « non précisé » (null).

alter table public.teams
  add column if not exists gender text
  check (gender in ('messieurs', 'dames', 'mixte'));

comment on column public.teams.gender is
  'Catégorie de genre de l''équipe : messieurs (masculine) | dames (féminine) | mixte. Null = non précisé.';
