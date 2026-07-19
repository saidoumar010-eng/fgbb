import { fullDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Ban, Comment, CommentTarget, ContentStatus, ModerationRow } from '@/lib/types';

/** Contenus signalables : un commentaire d'article/match ou un message du chat. */
export type ReportTarget = ModerationRow['target_type'];

export const COMMENT_MAX = 1000;

// ---------------------------------------------------------------------------
// Commentaires

export async function listComments(targetType: CommentTarget, targetId: string) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Comment[];
}

/**
 * Un trigger SQL remplit author_name, force le statut et applique les contrôles
 * (bannissement, langage, anti-spam) : on n'envoie que le strict nécessaire et
 * on laisse remonter le message d'erreur Postgres, déjà rédigé en français.
 */
export async function addComment(
  targetType: CommentTarget,
  targetId: string,
  userId: string,
  body: string,
) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ target_type: targetType, target_id: targetId, user_id: userId, body })
    .select('*')
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

export async function setCommentStatus(id: string, status: ContentStatus) {
  const { error } = await supabase.from('comments').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function countComments(targetType: CommentTarget, targetId: string) {
  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'visible');
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Signalements

/**
 * Renvoie false si le supporter avait déjà signalé ce contenu : la contrainte
 * d'unicité n'est pas une erreur à lui montrer, juste un doublon sans effet.
 */
export async function reportContent(
  targetType: ReportTarget,
  targetId: string,
  userId: string,
  reason: string,
) {
  const { error } = await supabase
    .from('reports')
    .insert({ target_type: targetType, target_id: targetId, user_id: userId, reason });
  if (error && error.code === '23505') return false;
  if (error) throw error;
  return true;
}

// ---------------------------------------------------------------------------
// Modération (réservée aux admins par les policies RLS)

export async function listModerationQueue() {
  const { data, error } = await supabase.rpc('moderation_queue');
  if (error) throw error;
  return (data ?? []) as ModerationRow[];
}

export async function resolveReport(reportId: string) {
  const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
  if (error) throw error;
}

/** Un même message peut être signalé plusieurs fois : une décision les clôt tous. */
export async function resolveReportsFor(targetType: ReportTarget, targetId: string) {
  const { error } = await supabase
    .from('reports')
    .update({ status: 'resolved' })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open');
  if (error) throw error;
}

export async function setChatStatus(id: string, status: ContentStatus) {
  const { error } = await supabase.from('chat_messages').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function hideChatMessage(id: string) {
  await setChatStatus(id, 'hidden');
}

/** Masque/réaffiche un contenu sans que l'appelant ait à savoir d'où il vient. */
export async function setContentStatus(
  targetType: ReportTarget,
  targetId: string,
  status: ContentStatus,
) {
  if (targetType === 'chat') return setChatStatus(targetId, status);
  return setCommentStatus(targetId, status);
}

// ---------------------------------------------------------------------------
// Bannissements

export async function listBans() {
  const { data, error } = await supabase
    .from('bans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Ban[];
}

/** `until` à null = bannissement définitif. Un nouveau bannissement remplace l'ancien. */
export async function banUser(userId: string, reason: string | null, until: string | null) {
  const { error } = await supabase
    .from('bans')
    .upsert({ user_id: userId, reason, until }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function unbanUser(userId: string) {
  const { error } = await supabase.from('bans').delete().eq('user_id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Mots interdits

export async function listModerationWords() {
  const { data, error } = await supabase.from('moderation_words').select('word').order('word');
  if (error) throw error;
  return ((data ?? []) as { word: string }[]).map((r) => r.word);
}

/** Le filtre SQL compare en minuscules : on normalise avant d'enregistrer. */
export async function addModerationWord(word: string) {
  const { error } = await supabase
    .from('moderation_words')
    .insert({ word: word.trim().toLowerCase() });
  if (error) throw error;
}

export async function removeModerationWord(word: string) {
  const { error } = await supabase.from('moderation_words').delete().eq('word', word);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Dates relatives

type Translate = (fr: string, vars?: Record<string, string | number>) => string;

/**
 * « il y a 5 min » pour les messages des supporters : au-delà d'un mois, la
 * date complète reste plus parlante qu'un compte de jours.
 * Vit ici parce que src/lib/format.ts est partagé et ne doit pas bouger.
 */
export function timeAgo(iso: string, t: Translate) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return t('à l’instant');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('il y a {n} min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('il y a {n} h', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 31) return t('il y a {n} j', { n: days });
  return fullDate(iso);
}
