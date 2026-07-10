// Types des entités FGBB (alignés sur le schéma Supabase).

export type CompetitionType = 'championnat' | 'coupe' | 'tournoi';
export type Category = 'messieurs' | 'dames' | 'u18' | 'autre';
export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type Role = 'fan' | 'admin';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
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
  assists: number;
  steals: number;
  blocks: number;
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
  category: string | null;
  body: string | null;
  cover_url: string | null;
  author: string | null;
  published_at: string;
  created_at: string;
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

export type MatchEventKind = 'points' | 'correction' | 'quarter' | 'info';

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
