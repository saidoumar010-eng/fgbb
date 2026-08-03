import { supabase } from '@/lib/supabase';
import type { ClubInboxMessage, SentClubMessage } from '@/lib/types';

/**
 * Messagerie fédération → clubs (Phase G). Les garde-fous sont dans la base
 * (migration 0025) : l'écriture est réservée à l'admin, la lecture au(x)
 * club(s) destinataire(s), et l'accusé de lecture passe par une fonction.
 */

// ---------------------------------------------------------------------------
// Côté club

export async function listMyClubMessages(teamId: string): Promise<ClubInboxMessage[]> {
  const { data, error } = await supabase
    .from('club_message_recipients')
    .select('read_at, message:club_messages(*)')
    .eq('team_id', teamId)
    .order('created_at', { referencedTable: 'club_messages', ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ClubInboxMessage[];
  // Tri de sûreté : le plus récent d'abord même si l'ordre imbriqué manque.
  return rows.sort((a, b) => (b.message?.created_at ?? '').localeCompare(a.message?.created_at ?? ''));
}

export async function countUnreadClubMessages(teamId: string): Promise<number> {
  const { count, error } = await supabase
    .from('club_message_recipients')
    .select('message_id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markClubMessagesRead(teamId: string) {
  const { error } = await supabase.rpc('mark_club_messages_read', { p_team_id: teamId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Côté fédération

export async function sendClubMessage(title: string, body: string, teamIds: string[]) {
  const { data, error } = await supabase
    .from('club_messages')
    .insert({ title: title.trim(), body: body.trim() })
    .select('id')
    .single();
  if (error) throw error;
  const messageId = (data as { id: string }).id;
  const { error: recError } = await supabase
    .from('club_message_recipients')
    .insert(teamIds.map((team_id) => ({ message_id: messageId, team_id })));
  if (recError) throw recError;
}

export async function listSentClubMessages(): Promise<SentClubMessage[]> {
  const { data, error } = await supabase
    .from('club_messages')
    .select('*, recipients:club_message_recipients(team_id, read_at, team:teams(id, name, short_name, color, logo_url))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SentClubMessage[];
}

export async function deleteClubMessage(id: string) {
  const { error } = await supabase.from('club_messages').delete().eq('id', id);
  if (error) throw error;
}
