import { supabase } from '@/lib/supabase';
import type {
  Category,
  ClubRegistration,
  License,
  LicenseStatus,
  RegistrationStatus,
  Season,
  Transfer,
  TransferStatus,
} from '@/lib/types';

// Accès aux données administratives de la fédération : saisons, licences,
// transferts, inscriptions de clubs. Même contrat que src/lib/db.ts : on relaie
// l'erreur Supabase telle quelle et on renvoie les types de src/lib/types.ts.

const LICENSE_SELECT = '*, player:players(*), season:seasons(*), team:teams(*)';
const TRANSFER_SELECT =
  '*, player:players(*), from_team:teams!from_team_id(*), to_team:teams!to_team_id(*)';
const REGISTRATION_SELECT = '*, competition:competitions(*)';

// ---------------------------------------------------------------------------
// Saisons

export async function listSeasons() {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Season[];
}

export async function getSeason(id: string) {
  const { data, error } = await supabase.from('seasons').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Season;
}

export async function upsertSeason(input: {
  id?: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
}) {
  const { id, ...payload } = input;
  // Un index unique partiel n'autorise qu'une seule saison is_current : il faut
  // libérer la place AVANT d'écrire, sinon Postgres rejette la ligne.
  if (payload.is_current) await clearCurrentSeason(id);

  const { data, error } = id
    ? await supabase.from('seasons').update(payload).eq('id', id).select().single()
    : await supabase.from('seasons').insert(payload).select().single();
  if (error) throw error;
  return data as Season;
}

export async function deleteSeason(id: string) {
  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) throw error;
}

export async function setCurrentSeason(id: string) {
  await clearCurrentSeason(id);
  const { error } = await supabase.from('seasons').update({ is_current: true }).eq('id', id);
  if (error) throw error;
}

async function clearCurrentSeason(exceptId?: string) {
  let q = supabase.from('seasons').update({ is_current: false }).eq('is_current', true);
  if (exceptId) q = q.neq('id', exceptId);
  const { error } = await q;
  if (error) throw error;
}

export async function getCurrentSeason() {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  return (data as Season) ?? null;
}

// ---------------------------------------------------------------------------
// Licences (lecture réservée aux administrateurs par RLS)

export async function listLicenses(status?: LicenseStatus) {
  let q = supabase
    .from('licenses')
    .select(LICENSE_SELECT)
    .order('expires_at', { ascending: true, nullsFirst: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as License[];
}

export async function getLicense(id: string) {
  const { data, error } = await supabase.from('licenses').select(LICENSE_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as unknown as License;
}

export async function upsertLicense(input: {
  id?: string;
  player_id: string;
  season_id?: string | null;
  team_id?: string | null;
  number?: string | null;
  status?: LicenseStatus;
  issued_at?: string | null;
  expires_at?: string | null;
  document_url?: string | null;
  note?: string | null;
}) {
  const { id, ...payload } = input;
  const { data, error } = id
    ? await supabase.from('licenses').update(payload).eq('id', id).select().single()
    : await supabase.from('licenses').insert(payload).select().single();
  if (error) throw error;
  return data as License;
}

export async function deleteLicense(id: string) {
  const { error } = await supabase.from('licenses').delete().eq('id', id);
  if (error) throw error;
}

export async function setLicenseStatus(id: string, status: LicenseStatus) {
  const { error } = await supabase.from('licenses').update({ status }).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Transferts
//
// Un trigger SQL bascule players.team_id dès qu'un transfert passe en
// 'approved' : le client ne touche jamais à l'effectif lui-même.

export async function listTransfers(status?: TransferStatus) {
  let q = supabase
    .from('transfers')
    .select(TRANSFER_SELECT)
    .order('requested_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Transfer[];
}

export async function getTransfer(id: string) {
  const { data, error } = await supabase
    .from('transfers')
    .select(TRANSFER_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as Transfer;
}

export async function upsertTransfer(input: {
  id?: string;
  player_id: string;
  from_team_id?: string | null;
  to_team_id?: string | null;
  season_id?: string | null;
  status?: TransferStatus;
  note?: string | null;
}) {
  const { id, ...payload } = input;
  const { data, error } = id
    ? await supabase.from('transfers').update(payload).eq('id', id).select().single()
    : await supabase.from('transfers').insert(payload).select().single();
  if (error) throw error;
  return data as Transfer;
}

export async function deleteTransfer(id: string) {
  const { error } = await supabase.from('transfers').delete().eq('id', id);
  if (error) throw error;
}

export async function setTransferStatus(id: string, status: TransferStatus) {
  const { error } = await supabase
    .from('transfers')
    .update({ status, decided_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Inscriptions des clubs

export async function listRegistrations(status?: RegistrationStatus) {
  let q = supabase
    .from('club_registrations')
    .select(REGISTRATION_SELECT)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ClubRegistration[];
}

export async function listMyRegistrations() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  // Un administrateur voit toutes les demandes : on filtre explicitement pour
  // que cet écran ne montre que les siennes.
  if (!userId) return [];
  const { data, error } = await supabase
    .from('club_registrations')
    .select(REGISTRATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ClubRegistration[];
}

export async function submitRegistration(input: {
  club_name: string;
  city?: string | null;
  category: Category;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  logo_url?: string | null;
  note?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Connecte-toi pour envoyer une demande.');

  const { data, error } = await supabase
    .from('club_registrations')
    .insert({ ...input, user_id: userId })
    .select(REGISTRATION_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as ClubRegistration;
}

export async function approveRegistration(id: string) {
  const { data, error: readErr } = await supabase
    .from('club_registrations')
    .select('*')
    .eq('id', id)
    .single();
  if (readErr) throw readErr;
  const reg = data as ClubRegistration;

  // Une demande déjà rattachée à une équipe ne doit pas en créer une seconde
  // (double appui sur « Approuver », reprise après une erreur réseau).
  let teamId = reg.team_id;
  if (!teamId) {
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .insert({
        name: reg.club_name,
        short_name: shortName(reg.club_name),
        city: reg.city,
        logo_url: reg.logo_url,
      })
      .select('id')
      .single();
    if (teamErr) throw teamErr;
    teamId = (team as { id: string }).id;
  }

  const { error } = await supabase
    .from('club_registrations')
    .update({ status: 'approved', team_id: teamId, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return teamId;
}

export async function rejectRegistration(id: string) {
  const { error } = await supabase
    .from('club_registrations')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Sigle proposé pour le club créé : initiales des mots (ASC pour « Amicale
// Sportive de Conakry »), sinon le début du nom. L'admin peut le corriger.
function shortName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return (initials.length >= 2 ? initials : name.trim().toUpperCase()).slice(0, 4);
}
