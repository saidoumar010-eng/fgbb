-- Table de marque : chronomètre, fautes d'équipe, temps morts.
--
-- Le chronomètre n'est PAS écrit chaque seconde. On enregistre le temps
-- restant, l'état marche/arrêt et l'instant de la dernière décision ; chaque
-- téléphone en déduit la seconde courante. Une écriture par action au lieu
-- d'une par seconde : c'est ce qui rend le direct tenable sur un forfait
-- mobile guinéen et sur le quota gratuit de Supabase.

alter table public.matches
  add column if not exists clock_seconds    int     not null default 600,
  add column if not exists clock_running    boolean not null default false,
  add column if not exists clock_updated_at timestamptz;

-- Fautes d'équipe du quart-temps EN COURS : au-delà de 4, l'adversaire tire
-- des lancers francs (bonus FIBA). Remises à zéro à chaque quart-temps.
alter table public.matches
  add column if not exists home_fouls int not null default 0,
  add column if not exists away_fouls int not null default 0;

-- Temps morts pris dans la MI-TEMPS en cours : 2 en première, 3 en seconde
-- (règlement FIBA). Remis à zéro au passage au 3e quart-temps.
alter table public.matches
  add column if not exists home_timeouts int not null default 0,
  add column if not exists away_timeouts int not null default 0;

-- Le fil du match accueille désormais les fautes et les temps morts, à côté
-- des paniers. L'ancienne contrainte ne connaît que quatre natures : on la
-- remplace sans toucher aux lignes déjà écrites, toutes encore valides.
alter table public.match_events drop constraint if exists match_events_kind_check;
alter table public.match_events add constraint match_events_kind_check
  check (kind in ('points', 'correction', 'quarter', 'info', 'foul', 'timeout'));

-- Les policies de `matches` et `match_events` couvrent déjà ces colonnes
-- (lecture publique, écriture réservée aux admins) : rien à ajouter.
-- Ne pas introduire de policy appelant is_admin() en lecture — anon ne peut
-- pas l'exécuter et la requête entière échouerait (cf. migrations 0009/0017).
