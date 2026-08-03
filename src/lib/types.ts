// Types des entités FGBB (alignés sur le schéma Supabase).

export type CompetitionType = 'championnat' | 'coupe' | 'tournoi';
export type Category = 'messieurs' | 'dames' | 'u18' | 'autre';
export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type Role = 'fan' | 'admin' | 'table_technique';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  show_in_leaderboard: boolean;
  created_at: string;
}

export interface Competition {
  id: string;
  name: string;
  type: CompetitionType;
  category: Category;
  season: string | null;
  format: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  division: string | null;
  coach: string | null;
  founded_year: number | null;
  color: string | null;
  logo_url: string | null;
  is_national: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  full_name: string;
  team_id: string | null;
  number: number | null;
  position: string | null;
  height_cm: number | null;
  birth_date: string | null;
  nationality: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface QuarterScore {
  q: number;
  home: number;
  away: number;
}

export interface Match {
  id: string;
  competition_id: string | null;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string | null;
  venue: string | null;
  status: MatchStatus;
  home_score: number;
  away_score: number;
  current_quarter: number | null;
  quarter_scores: QuarterScore[];
  video_url: string | null;
  stream_url: string | null;   // diffusion en direct
  officials_validated_at: string | null; // feuille validée par la table technique
  officials_validated_by: string | null;
  season_id: string | null;
  round: number | null;        // journée du championnat
  group_name: string | null;   // poule
  // Table de marque. Le chrono est stocké en trois champs plutôt qu'écrit
  // chaque seconde — cf. lib/game-clock.ts.
  clock_seconds: number;       // restant dans la période à la dernière décision
  clock_running: boolean;
  clock_updated_at: string | null;
  home_fouls: number;          // fautes d'équipe du quart-temps en cours
  away_fouls: number;
  home_timeouts: number;       // temps morts pris dans la mi-temps en cours
  away_timeouts: number;
  created_at: string;
  // jointures éventuelles
  home_team?: Team;
  away_team?: Team;
  competition?: Competition;
}

export interface PlayerMatchStat {
  id: string;
  match_id: string;
  player_id: string;
  team_id: string | null;
  minutes: number;
  points: number;
  rebounds: number;
  off_rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  plus_minus: number;
  fouls: number;
  fg_made: number;
  fg_att: number;
  three_made: number;
  three_att: number;
  ft_made: number;
  ft_att: number;
  player?: Player;
}

export interface NewsItem {
  id: string;
  title: string;
  title_en: string | null;
  category: string | null;
  body: string | null;
  body_en: string | null;
  cover_url: string | null;
  author: string | null;
  published_at: string;
  created_at: string;
}

export interface ClubMessage {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
}

// Côté club : le message reçu avec l'accusé de lecture de l'équipe.
export interface ClubInboxMessage {
  read_at: string | null;
  message: ClubMessage | null;
}

// Côté fédération : un message envoyé avec l'état de lecture par destinataire.
export interface SentClubMessage extends ClubMessage {
  recipients: { team_id: string; read_at: string | null; team?: Team }[];
}

export type AwardKind = 'joueur_du_mois' | 'mvp_saison' | 'meilleur_cinq' | 'autre';

export interface Award {
  id: string;
  kind: AwardKind;
  season_id: string | null;
  player_id: string | null;
  team_id: string | null;
  label: string | null;
  note: string | null;
  awarded_at: string | null;
  created_at: string;
  player?: Player;
  team?: Team;
}

export interface ClubPost {
  id: string;
  team_id: string;
  author_id: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
  team?: Team;
}

export interface Standing {
  competition_id: string | null;
  team_id: string;
  team_name: string;
  short_name: string | null;
  color: string | null;
  played: number;
  wins: number;
  losses: number;
  points: number;
}

export type MatchEventKind = 'points' | 'correction' | 'quarter' | 'info' | 'foul' | 'timeout';

export interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string | null;
  player_id: string | null;
  kind: MatchEventKind;
  points: number;
  quarter: number | null;
  label: string | null;
  created_at: string;
  // jointures éventuelles
  player?: Player | null;
  team?: Team | null;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  is_active: boolean;
  created_at: string;
}

export interface PollVote {
  poll_id: string;
  user_id: string;
  option_index: number;
  created_at: string;
}

export interface MvpVote {
  match_id: string;
  user_id: string;
  player_id: string;
  created_at: string;
}

export interface Prediction {
  match_id: string;
  user_id: string;
  team_id: string;
  created_at: string;
}

export interface PlayerSeasonStat {
  player_id: string;
  full_name: string;
  team_id: string | null;
  games: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fg_pct: number;
  three_pct: number;
}

// ---------------------------------------------------------------------------
// Gestion de la fédération : saisons, licences, arbitres, discipline,
// transferts, inscriptions de clubs.

export interface Season {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
}

export type LicenseStatus = 'pending' | 'valid' | 'suspended' | 'expired';

export interface License {
  id: string;
  player_id: string;
  season_id: string | null;
  team_id: string | null;
  number: string | null;
  status: LicenseStatus;
  issued_at: string | null;
  expires_at: string | null;
  document_url: string | null;
  note: string | null;
  created_at: string;
  player?: Player;
  season?: Season;
  team?: Team;
}

export type RefereeLevel = 'regional' | 'national' | 'fiba';

export interface Referee {
  id: string;
  full_name: string;
  city: string | null;
  level: RefereeLevel;
  license_number: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RefereeContact {
  referee_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export type OfficialRole = 'principal' | 'assistant' | 'table' | 'commissaire';

export interface MatchOfficial {
  match_id: string;
  referee_id: string;
  role: OfficialRole;
  created_at: string;
  referee?: Referee;
}

export type SanctionKind = 'avertissement' | 'suspension' | 'amende' | 'exclusion';
export type SanctionStatus = 'active' | 'served' | 'cancelled';

export interface Sanction {
  id: string;
  player_id: string | null;
  team_id: string | null;
  match_id: string | null;
  kind: SanctionKind;
  games: number;
  amount_gnf: number;
  reason: string | null;
  decided_at: string;
  status: SanctionStatus;
  created_at: string;
  player?: Player;
  team?: Team;
}

export type TransferStatus = 'pending' | 'approved' | 'rejected';

export interface Transfer {
  id: string;
  player_id: string;
  from_team_id: string | null;
  to_team_id: string | null;
  season_id: string | null;
  status: TransferStatus;
  note: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
  player?: Player;
  from_team?: Team;
  to_team?: Team;
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface ClubRegistration {
  id: string;
  user_id: string | null;
  club_name: string;
  city: string | null;
  category: Category;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  competition_id: string | null;
  season_id: string | null;
  logo_url: string | null;
  note: string | null;
  status: RegistrationStatus;
  team_id: string | null;
  created_at: string;
  decided_at: string | null;
  competition?: Competition;
}

// ---------------------------------------------------------------------------
// Communauté : commentaires, chat en direct, signalements, modération.

export type CommentTarget = 'match' | 'news';
export type ContentStatus = 'visible' | 'hidden';

export interface Comment {
  id: string;
  target_type: CommentTarget;
  target_id: string;
  user_id: string;
  author_name: string;
  body: string;
  status: ContentStatus;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  match_id: string;
  user_id: string;
  author_name: string;
  body: string;
  status: ContentStatus;
  created_at: string;
}

export interface ModerationRow {
  report_id: string;
  target_type: 'comment' | 'chat';
  target_id: string;
  reason: string | null;
  reported_at: string;
  author_name: string | null;
  author_id: string | null;
  body: string | null;
  status: ContentStatus | null;
  reports: number;
}

export interface Ban {
  user_id: string;
  reason: string | null;
  until: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Quiz & classement des supporters.

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  options: string[];
  correct_index: number;
  position: number;
  created_at: string;
}

/** Question telle qu'envoyée au téléphone : sans la bonne réponse. */
export interface PublicQuizQuestion {
  id: string;
  question: string;
  options: string[];
  sort_order: number;
}

export interface QuizResult {
  score: number;
  total: number;
  corrections: { question_id: string; correct_index: number; chosen: number | null }[];
}

export interface QuizAttempt {
  quiz_id: string;
  user_id: string;
  score: number;
  total: number;
  created_at: string;
}

export interface LeaderboardRow {
  position_no: number;
  name: string;
  points: number;
  predictions: number;
  correct: number;
  is_me: boolean;
}

export interface FanStats {
  points: number;
  predictions: number;
  correct: number;
  quiz_points: number;
  mvp_votes: number;
  position_no: number;
}

// ---------------------------------------------------------------------------
// Statistiques avancées.

export interface Shot {
  id: string;
  match_id: string;
  player_id: string | null;
  team_id: string | null;
  x: number;
  y: number;
  points: 1 | 2 | 3;
  made: boolean;
  quarter: number | null;
  created_at: string;
  player?: Player;
}

export interface TeamSeasonStat {
  team_id: string;
  competition_id: string | null;
  team_name: string;
  short_name: string | null;
  color: string | null;
  games: number;
  wins: number;
  losses: number;
  pts_for: number;
  pts_against: number;
  diff: number;
  best_score: number;
}

export interface TeamAdvancedStat {
  team_id: string;
  team_name: string;
  short_name: string | null;
  color: string | null;
  games: number;
  efg_pct: number;
  tov_pct: number;
  orb_pct: number;
  ft_rate: number;
  ppg: number;
}

export interface FederationStats {
  fans: number;
  predictions: number;
  mvp_votes: number;
  poll_votes: number;
  quiz_attempts: number;
  club_posts: number;
  follows: number;
}

export interface TopFollowedTeam {
  team_id: string;
  team_name: string;
  followers: number;
}

export interface GameHigh {
  id: string;
  match_id: string;
  player_id: string;
  full_name: string;
  photo_url: string | null;
  team_id: string | null;
  team_short: string | null;
  team_color: string | null;
  scheduled_at: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  three_made: number;
}

export interface ProgressionPoint {
  match_id: string;
  scheduled_at: string | null;
  opponent: string | null;
  points: number;
  rebounds: number;
  assists: number;
}

// ---------------------------------------------------------------------------
// Contenus & médias.

export interface Photo {
  id: string;
  match_id: string | null;
  album: string | null;
  url: string;
  caption: string | null;
  credit: string | null;
  position: number;
  created_at: string;
}

export type EventCategory = 'federation' | 'competition' | 'formation' | 'ceremonie' | 'autre';

export interface FedEvent {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  cover_url: string | null;
  created_at: string;
}

export type MediaKind = 'interview' | 'podcast' | 'reportage' | 'video';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  description: string | null;
  url: string;
  cover_url: string | null;
  duration_min: number | null;
  published_at: string;
  created_at: string;
}

export type SponsorTier = 'principal' | 'officiel' | 'media' | 'partenaire';
export type SponsorPlacement = 'accueil' | 'match' | 'tous';

export interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  url: string | null;
  tier: SponsorTier;
  placement: SponsorPlacement;
  position: number;
  is_active: boolean;
  created_at: string;
}

/** Coordonnées et présentation de la fédération (table `settings`, clé `federation`). */
export interface FederationInfo {
  about?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  facebook?: string;
  youtube?: string;
  president?: string;
}
