import { supabase } from '@/lib/supabase';
import type { Award, AwardKind } from '@/lib/types';

// Libellés des distinctions, partagés entre l'espace admin et l'affichage public.
export const AWARD_KINDS: { id: AwardKind; label: string; icon: string }[] = [
  { id: 'joueur_du_mois', label: 'Joueur du mois', icon: 'calendar' },
  { id: 'mvp_saison', label: 'MVP de la saison', icon: 'trophy' },
  { id: 'meilleur_cinq', label: 'Meilleur cinq', icon: 'star' },
  { id: 'autre', label: 'Distinction', icon: 'ribbon' },
];

export function awardKindLabel(kind?: AwardKind | null) {
  return AWARD_KINDS.find((k) => k.id === kind)?.label ?? '';
}

const AWARD_SELECT = '*, player:players(*), team:teams(*)';

export async function listAwards(): Promise<Award[]> {
  const { data, error } = await supabase
    .from('awards')
    .select(AWARD_SELECT)
    .order('awarded_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Award[];
}

export interface AwardInput {
  kind: AwardKind;
  player_id: string | null;
  team_id: string | null;
  season_id: string | null;
  label: string | null;
  note: string | null;
  awarded_at: string | null;
}

export async function upsertAward(input: AwardInput, id?: string | null) {
  const { error } = id
    ? await supabase.from('awards').update(input).eq('id', id)
    : await supabase.from('awards').insert(input);
  if (error) throw error;
}

export async function deleteAward(id: string) {
  const { error } = await supabase.from('awards').delete().eq('id', id);
  if (error) throw error;
}
