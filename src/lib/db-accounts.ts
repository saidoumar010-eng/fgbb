import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';

/**
 * Recherche de comptes pour la fédération (Phase D+).
 *
 * S'appuie sur la fonction `search_accounts` (migration 0028) qui lit
 * `auth.users` — réservée aux admins côté base. Sert à désigner un officiel de
 * table ou un dirigeant de club sans copier d'UUID depuis le dashboard.
 */

export interface AccountSearchResult {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
}

export async function searchAccounts(query: string): Promise<AccountSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_accounts', { p_query: q });
  if (error) throw error;
  return (data ?? []) as AccountSearchResult[];
}
