import { supabase } from '@/lib/supabase';
import type { FederationInfo, Sponsor, SponsorPlacement, SponsorTier } from '@/lib/types';

// Accès aux données « vitrine » de la fédération : partenaires et informations
// institutionnelles. Même contrat que src/lib/db.ts : l'erreur Supabase est
// relayée telle quelle et les types viennent de src/lib/types.ts.

/** Les informations de la fédération tiennent dans une seule ligne de `settings`. */
const FEDERATION_KEY = 'federation';

/** Ordre protocolaire : le partenaire principal passe toujours devant. */
export const TIER_ORDER: SponsorTier[] = ['principal', 'officiel', 'media', 'partenaire'];

export const TIER_LABELS: Record<SponsorTier, string> = {
  principal: 'Partenaire principal',
  officiel: 'Partenaire officiel',
  media: 'Partenaire média',
  partenaire: 'Partenaire',
};

/** Intitulé au pluriel, pour les en-têtes de groupe de la page « À propos ». */
export const TIER_GROUP_LABELS: Record<SponsorTier, string> = {
  principal: 'Partenaire principal',
  officiel: 'Partenaires officiels',
  media: 'Partenaires médias',
  partenaire: 'Partenaires',
};

export const PLACEMENT_LABELS: Record<SponsorPlacement, string> = {
  accueil: 'Accueil',
  match: 'Page match',
  tous: 'Partout',
};

export interface SponsorInput {
  id?: string;
  name: string;
  logo_url?: string | null;
  url?: string | null;
  tier: SponsorTier;
  placement: SponsorPlacement;
  position?: number;
  is_active?: boolean;
}

/**
 * Partenaires visibles à un emplacement donné.
 * Sans `placement`, on récupère tout le portefeuille (page « À propos », admin).
 * `includeInactive` est réservé à l'espace fédération : le public ne voit jamais
 * un partenaire désactivé.
 */
export async function listSponsors(
  placement?: SponsorPlacement,
  opts: { includeInactive?: boolean } = {},
) {
  let q = supabase.from('sponsors').select('*');
  if (!opts.includeInactive) q = q.eq('is_active', true);
  // Un partenaire marqué « tous » doit apparaître sur chaque emplacement.
  if (placement && placement !== 'tous') q = q.in('placement', [placement, 'tous']);
  const { data, error } = await q
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Sponsor[];
}

export async function getSponsor(id: string) {
  const { data, error } = await supabase.from('sponsors').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Sponsor;
}

export async function upsertSponsor(s: SponsorInput) {
  const payload = {
    name: s.name,
    logo_url: s.logo_url ?? null,
    url: s.url ?? null,
    tier: s.tier,
    placement: s.placement,
    position: s.position ?? 0,
    is_active: s.is_active ?? true,
  };
  const q = s.id
    ? supabase.from('sponsors').update(payload).eq('id', s.id)
    : supabase.from('sponsors').insert(payload);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as Sponsor;
}

export async function deleteSponsor(id: string) {
  const { error } = await supabase.from('sponsors').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderSponsor(id: string, position: number) {
  const { error } = await supabase.from('sponsors').update({ position }).eq('id', id);
  if (error) throw error;
}

/**
 * Classe une liste déjà triée par position selon le rang du partenaire.
 * Le tri natif étant stable, l'ordre choisi par la fédération est conservé
 * à l'intérieur de chaque niveau.
 */
export function sortByTier(list: Sponsor[]) {
  return [...list].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

/** Les liens sont saisis à la main : « fgbb.gn » doit rester ouvrable. */
export function externalUrl(raw: string | null | undefined) {
  const v = (raw ?? '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export async function getFederationInfo() {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', FEDERATION_KEY)
    .maybeSingle();
  if (error) throw error;
  // Aucune ligne enregistrée : on renvoie un objet vide, jamais null.
  return (data?.value ?? {}) as FederationInfo;
}

export async function saveFederationInfo(info: FederationInfo) {
  // On n'enregistre que les champs réellement remplis : la page publique
  // masque une information absente au lieu d'afficher une ligne vide.
  const value: FederationInfo = {};
  (Object.keys(info) as (keyof FederationInfo)[]).forEach((k) => {
    const v = info[k];
    if (typeof v === 'string' && v.trim()) value[k] = v.trim();
  });
  const { error } = await supabase
    .from('settings')
    .upsert({ key: FEDERATION_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return value;
}

/** Vrai tant qu'aucune information n'a été saisie par la fédération. */
export function isFederationInfoEmpty(info: FederationInfo | null | undefined) {
  if (!info) return true;
  return !Object.values(info).some((v) => typeof v === 'string' && v.trim());
}
