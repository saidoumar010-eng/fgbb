import { MATCH_SELECT } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { EventCategory, FedEvent, Match, MediaItem, MediaKind, Photo } from '@/lib/types';

// Accès aux contenus éditoriaux : galeries photo, agenda de la fédération et
// médiathèque. Même contrat que src/lib/db.ts : l'erreur Supabase est relayée
// telle quelle, les données sortent typées selon src/lib/types.ts.

// ---------------------------------------------------------------------------
// Libellés partagés entre les écrans publics et l'espace admin.

export const EVENT_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: 'federation', label: 'Fédération' },
  { id: 'competition', label: 'Compétition' },
  { id: 'formation', label: 'Formation' },
  { id: 'ceremonie', label: 'Cérémonie' },
  { id: 'autre', label: 'Autre' },
];

// `label` sert aux filtres (au pluriel), `one` à la pastille d'une carte.
export const MEDIA_KINDS: { id: MediaKind; label: string; one: string }[] = [
  { id: 'interview', label: 'Interviews', one: 'Interview' },
  { id: 'podcast', label: 'Podcasts', one: 'Podcast' },
  { id: 'reportage', label: 'Reportages', one: 'Reportage' },
  { id: 'video', label: 'Vidéos', one: 'Vidéo' },
];

export function eventCategoryLabel(c?: EventCategory | null) {
  return EVENT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Autre';
}

export function mediaKindLabel(k?: MediaKind | null) {
  return MEDIA_KINDS.find((x) => x.id === k)?.one ?? 'Média';
}

// ---------------------------------------------------------------------------
// Dates saisies par la fédération.
//
// La Guinée est à l'heure GMT et src/lib/format.ts affiche tout en UTC : on
// enregistre donc la saisie telle quelle en UTC, sans passer par le fuseau du
// téléphone de l'administrateur (qui peut être en déplacement).

/** « 2026-03-12 » + « 18:30 » -> ISO UTC. Renvoie null si la date est invalide. */
export function toIso(date: string, time?: string | null): string | null {
  const d = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const raw = (time ?? '').trim();
  const hhmm = /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0') : '00:00';
  return `${d}T${hhmm}:00.000Z`;
}

/** Inverse de toIso, pour réalimenter un formulaire en édition. */
export function fromIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

// ---------------------------------------------------------------------------
// Photos

export interface NewPhoto {
  match_id?: string | null;
  album?: string | null;
  url: string;
  caption?: string | null;
  credit?: string | null;
  position?: number;
}

export async function listPhotos(opts: { matchId?: string | null; album?: string | null } = {}) {
  let q = supabase.from('photos').select('*');
  if (opts.matchId) q = q.eq('match_id', opts.matchId);
  if (opts.album) q = q.eq('album', opts.album);
  const { data, error } = await q.order('position').order('created_at');
  if (error) throw error;
  return (data ?? []) as Photo[];
}

export async function addPhotos(rows: NewPhoto[]) {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from('photos').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as Photo[];
}

export async function updatePhoto(
  id: string,
  patch: Partial<Pick<Photo, 'caption' | 'credit' | 'position' | 'album' | 'match_id'>>,
) {
  const { error } = await supabase.from('photos').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deletePhoto(id: string) {
  const { error } = await supabase.from('photos').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderPhoto(id: string, position: number) {
  const { error } = await supabase.from('photos').update({ position }).eq('id', id);
  if (error) throw error;
}

/** Une entrée de l'écran « Photos » : un album nommé ou un match photographié. */
export interface GalleryGroup {
  key: string;
  kind: 'album' | 'match';
  album: string | null;
  matchId: string | null;
  match: Match | null;
  cover: string | null;
  count: number;
  /** Date de la photo la plus récente du groupe — sert au tri. */
  lastAt: string;
}

type PhotoIndexRow = Pick<Photo, 'id' | 'match_id' | 'album' | 'url' | 'created_at'>;

export async function listAlbums(): Promise<GalleryGroup[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, match_id, album, url, created_at')
    .order('position')
    .order('created_at');
  if (error) throw error;

  // Regroupement côté client : PostgREST ne sait pas rendre en une requête un
  // DISTINCT avec compteur ET la première vignette de chaque groupe. Le volume
  // de photos d'une fédération reste très modeste.
  const groups = new Map<string, GalleryGroup>();
  for (const p of (data ?? []) as PhotoIndexRow[]) {
    // Une photo sans match ni album n'est rattachée à rien : rien à ranger.
    if (!p.match_id && !p.album) continue;
    const key = p.match_id ? `match:${p.match_id}` : `album:${p.album}`;
    const found = groups.get(key);
    if (found) {
      found.count += 1;
      if (p.created_at > found.lastAt) found.lastAt = p.created_at;
      continue;
    }
    groups.set(key, {
      key,
      kind: p.match_id ? 'match' : 'album',
      album: p.match_id ? null : p.album,
      matchId: p.match_id,
      match: null,
      cover: p.url, // la requête est déjà triée : c'est la première photo
      count: 1,
      lastAt: p.created_at,
    });
  }

  const list = [...groups.values()];
  const matchIds = list.map((g) => g.matchId).filter((id): id is string => !!id);
  if (matchIds.length > 0) {
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select(MATCH_SELECT)
      .in('id', matchIds);
    if (matchError) throw matchError;
    const byId = new Map((matches ?? []).map((m) => [(m as unknown as Match).id, m as unknown as Match]));
    for (const g of list) if (g.matchId) g.match = byId.get(g.matchId) ?? null;
  }

  // Les galeries les plus fraîches en tête, albums et matchs confondus.
  list.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return list;
}

// ---------------------------------------------------------------------------
// Agenda de la fédération

export interface EventInput {
  id?: string;
  title: string;
  description?: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  cover_url?: string | null;
}

export async function listEvents(upcomingOnly = false) {
  let q = supabase.from('events').select('*').order('starts_at', { ascending: true });
  if (upcomingOnly) {
    // Un événement sur plusieurs jours reste « à venir » tant qu'il n'est pas
    // terminé ; sans date de fin on se rabat sur la date de début.
    const now = new Date().toISOString();
    q = q.or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FedEvent[];
}

export async function getEvent(id: string) {
  const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
  if (error) throw error;
  return data as FedEvent;
}

export async function upsertEvent(e: EventInput) {
  const { id, ...payload } = e;
  const { data, error } = id
    ? await supabase.from('events').update(payload).eq('id', id).select().single()
    : await supabase.from('events').insert(payload).select().single();
  if (error) throw error;
  return data as FedEvent;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Médiathèque

export interface MediaInput {
  id?: string;
  kind: MediaKind;
  title: string;
  description?: string | null;
  url: string;
  cover_url?: string | null;
  duration_min?: number | null;
  published_at?: string;
}

export async function listMedia(kind?: MediaKind | null) {
  let q = supabase.from('media_items').select('*').order('published_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MediaItem[];
}

export async function getMediaItem(id: string) {
  const { data, error } = await supabase.from('media_items').select('*').eq('id', id).single();
  if (error) throw error;
  return data as MediaItem;
}

export async function upsertMediaItem(m: MediaInput) {
  const { id, ...payload } = m;
  const { data, error } = id
    ? await supabase.from('media_items').update(payload).eq('id', id).select().single()
    : await supabase.from('media_items').insert(payload).select().single();
  if (error) throw error;
  return data as MediaItem;
}

export async function deleteMediaItem(id: string) {
  const { error } = await supabase.from('media_items').delete().eq('id', id);
  if (error) throw error;
}
