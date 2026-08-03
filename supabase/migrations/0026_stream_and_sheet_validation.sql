-- Phase H — Diffusion en direct & validation de la feuille de match.
--
-- Deux champs sur les matchs, tous deux écrits par l'officiel de table ou
-- l'admin (policy matches_write, migration 0022) :
--   - stream_url : lien de diffusion en direct affiché aux supporters ;
--   - officials_validated_at/by : la table technique valide (au nom des arbitres
--     désignés) la feuille de match une fois les équipes prêtes.
alter table public.matches
  add column if not exists stream_url text,
  add column if not exists officials_validated_at timestamptz,
  add column if not exists officials_validated_by uuid references auth.users (id) on delete set null;
