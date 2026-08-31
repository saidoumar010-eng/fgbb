-- Marqueur manuel : la phase de poules d'une compétition est-elle terminée ?
-- Contrôle l'affichage du tableau des playoffs sur la page Classement.
--   null  = non défini  -> repli sur la détection automatique (aucun match de
--                          championnat restant)
--   true  = terminée    -> le tableau des playoffs s'affiche
--   false = en cours     -> le tableau des playoffs reste masqué
-- Lecture publique (déjà en place via la policy SELECT existante sur
-- competitions) ; écriture réservée aux admins (policy UPDATE existante).
alter table public.competitions
  add column if not exists group_stage_done boolean;

comment on column public.competitions.group_stage_done is
  'Phase de poules terminée (marqueur admin). null=auto, true=terminée, false=en cours.';
