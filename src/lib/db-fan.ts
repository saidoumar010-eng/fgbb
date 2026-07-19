import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';
import type {
  ChatMessage,
  FanStats,
  LeaderboardRow,
  PublicQuizQuestion,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  QuizResult,
} from '@/lib/types';

/**
 * Message lisible d'une erreur Supabase : les erreurs PostgREST sont des objets
 * simples (pas des instances d'Error), un `e instanceof Error` les manquerait.
 * Les triggers du chat renvoient déjà un texte français : on l'affiche tel quel.
 */
export function errorMessage(e: unknown, fallback = 'Une erreur est survenue') {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Chat en direct pendant un match.

/** Les messages sont renvoyés du plus récent au plus ancien (ordre d'affichage). */
export async function listChatMessages(matchId: string, limit = 60) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/**
 * L'auteur, le statut et les contrôles (match en cours, bannissement, mots
 * interdits, limite de débit) sont gérés par le trigger : on n'envoie que le
 * strict minimum.
 */
export async function sendChatMessage(matchId: string, userId: string, body: string) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ match_id: matchId, user_id: userId, body: body.trim() });
  if (error) throw error;
}

export async function reportChatMessage(messageId: string, userId: string, reason: string | null = null) {
  const { error } = await supabase
    .from('reports')
    .insert({ target_type: 'chat', target_id: messageId, user_id: userId, reason });
  // 23505 = signalement déjà envoyé par ce supporter : sans conséquence pour lui.
  if (error && error.code !== '23505') throw error;
}

// Compteur global : un nom de canal unique par abonnement, sinon Supabase
// refuse d'ajouter un 2e écouteur à un canal déjà abonné.
let channelSeq = 0;

export function useChatRealtime(matchId: string | undefined, onInsert: (message: ChatMessage) => void) {
  const cb = useRef(onInsert);
  cb.current = onInsert;
  useEffect(() => {
    if (!matchId) return;
    const name = `chat-${matchId}-${++channelSeq}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `match_id=eq.${matchId}` },
        (payload) => cb.current(payload.new as ChatMessage),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);
}

// ---------------------------------------------------------------------------
// Quiz côté supporter.
//
// La table quiz_questions n'est lisible que par les admins : le téléphone d'un
// supporter passe par quiz_questions_public (questions sans la bonne réponse)
// et submit_quiz (correction serveur).

export async function listQuizzes() {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Quiz[];
}

export async function getQuiz(id: string) {
  const { data, error } = await supabase.from('quizzes').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Quiz;
}

export async function listQuizQuestionsPublic(quizId: string) {
  const { data, error } = await supabase.rpc('quiz_questions_public', { p_quiz_id: quizId });
  if (error) throw error;
  return (data ?? []) as PublicQuizQuestion[];
}

export async function submitQuiz(quizId: string, answers: Record<string, number>) {
  const { data, error } = await supabase.rpc('submit_quiz', { p_quiz_id: quizId, p_answers: answers });
  if (error) throw error;
  const rows = (data ?? []) as QuizResult[];
  if (!rows.length) throw new Error('Le quiz n’a pas pu être corrigé.');
  return rows[0];
}

/** RLS ne laisse voir que ses propres tentatives ; `userId` sert aux comptes admin. */
export async function getMyAttempt(quizId: string, userId?: string) {
  let q = supabase.from('quiz_attempts').select('*').eq('quiz_id', quizId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return ((data ?? []) as QuizAttempt[])[0] ?? null;
}

/** Toutes mes tentatives : évite une requête par quiz sur l'écran de liste. */
export async function listMyAttempts(userId?: string) {
  let q = supabase.from('quiz_attempts').select('*');
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as QuizAttempt[];
}

// ---------------------------------------------------------------------------
// Quiz côté fédération.

export async function listQuizQuestionsAdmin(quizId: string) {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuizQuestion[];
}

export async function upsertQuiz(input: {
  id?: string;
  title: string;
  description?: string | null;
  is_active?: boolean;
}) {
  const payload = {
    title: input.title,
    description: input.description ?? null,
    is_active: input.is_active ?? false,
  };
  const q = input.id
    ? supabase.from('quizzes').update(payload).eq('id', input.id)
    : supabase.from('quizzes').insert(payload);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as Quiz;
}

export async function deleteQuiz(id: string) {
  const { error } = await supabase.from('quizzes').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertQuizQuestion(input: {
  id?: string;
  quiz_id: string;
  question: string;
  options: string[];
  correct_index: number;
  position: number;
}) {
  const payload = {
    quiz_id: input.quiz_id,
    question: input.question,
    options: input.options,
    correct_index: input.correct_index,
    position: input.position,
  };
  const q = input.id
    ? supabase.from('quiz_questions').update(payload).eq('id', input.id)
    : supabase.from('quiz_questions').insert(payload);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as QuizQuestion;
}

export async function deleteQuizQuestion(id: string) {
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
  if (error) throw error;
}

export async function setQuizActive(id: string, isActive: boolean) {
  const { error } = await supabase.from('quizzes').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Classement des supporters.
//
// Les deux fonctions SQL n'exposent aucun identifiant : la ligne du supporter
// connecté est simplement marquée `is_me`.

export async function getLeaderboard(limit = 50) {
  const { data, error } = await supabase.rpc('fan_leaderboard', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

export async function getMyFanStats() {
  const { data, error } = await supabase.rpc('my_fan_stats');
  if (error) throw error;
  return ((data ?? []) as FanStats[])[0] ?? null;
}

export async function setLeaderboardVisibility(userId: string, visible: boolean) {
  const { error } = await supabase
    .from('profiles')
    .update({ show_in_leaderboard: visible })
    .eq('id', userId);
  if (error) throw error;
}
