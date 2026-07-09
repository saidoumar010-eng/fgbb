-- Diffusion en temps réel des mises à jour de match (score en direct chez les supporters).
alter table public.matches replica identity full;
alter publication supabase_realtime add table public.matches;
