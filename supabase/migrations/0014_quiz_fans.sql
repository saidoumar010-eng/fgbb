-- ============================================================
-- Quiz basket + classement des supporters (points & badges).
-- ============================================================

-- Chaque supporter choisit d'apparaître ou non au classement public.
alter table public.profiles add column if not exists show_in_leaderboard boolean not null default true;

-- ---------------------------------------------------------------------------
-- Quiz : les bonnes réponses ne sont JAMAIS envoyées au téléphone.
-- Les questions sont lues via une fonction qui masque correct_index, et la
-- correction se fait côté serveur (submit_quiz).
create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.quizzes enable row level security;
drop policy if exists "quizzes_read" on public.quizzes;
drop policy if exists "quizzes_admin_write" on public.quizzes;
create policy "quizzes_read"        on public.quizzes for select using (is_active or public.is_admin());
create policy "quizzes_admin_write" on public.quizzes for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  question      text not null,
  options       jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

alter table public.quiz_questions enable row level security;
drop policy if exists "quiz_questions_admin_all" on public.quiz_questions;
create policy "quiz_questions_admin_all" on public.quiz_questions
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.quiz_attempts (
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  score      int not null default 0,
  total      int not null default 0,
  created_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);

alter table public.quiz_attempts enable row level security;
drop policy if exists "quiz_attempts_select_own_or_admin" on public.quiz_attempts;
create policy "quiz_attempts_select_own_or_admin" on public.quiz_attempts
  for select using (user_id = auth.uid() or public.is_admin());
-- Aucune écriture directe : seul submit_quiz() enregistre une tentative.

-- Questions sans les réponses (lecture publique).
-- `position` est un mot réservé dans une liste `returns table` : la colonne
-- est donc renvoyée sous le nom `sort_order`.
drop function if exists public.quiz_questions_public(uuid);
create function public.quiz_questions_public(p_quiz_id uuid)
returns table (id uuid, question text, options jsonb, sort_order int)
language sql
security definer
set search_path = public
as $$
  select q.id, q.question, q.options, q.position
    from public.quiz_questions q
    join public.quizzes z on z.id = q.quiz_id
   where q.quiz_id = p_quiz_id and (z.is_active or public.is_admin())
   order by q.position, q.created_at;
$$;

-- Correction serveur : p_answers = { "<question_id>": <index choisi>, ... }
create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb)
returns table (score int, total int, corrections jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int := 0;
  v_total int := 0;
  v_corr  jsonb := '[]'::jsonb;
  r       record;
  v_pick  int;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise pour participer au quiz';
  end if;
  if not exists (select 1 from public.quizzes where id = p_quiz_id and (is_active or public.is_admin())) then
    raise exception 'Quiz indisponible';
  end if;

  for r in
    select q.id, q.correct_index from public.quiz_questions q
     where q.quiz_id = p_quiz_id order by q.position, q.created_at
  loop
    v_total := v_total + 1;
    begin
      v_pick := (p_answers ->> r.id::text)::int;
    exception when others then
      v_pick := null;
    end;
    if v_pick is not null and v_pick = r.correct_index then
      v_score := v_score + 1;
    end if;
    v_corr := v_corr || jsonb_build_object(
      'question_id', r.id,
      'correct_index', r.correct_index,
      'chosen', v_pick
    );
  end loop;

  insert into public.quiz_attempts (quiz_id, user_id, score, total)
  values (p_quiz_id, auth.uid(), v_score, v_total)
  on conflict (quiz_id, user_id) do update
    set score = greatest(public.quiz_attempts.score, excluded.score),
        total = excluded.total;

  return query select v_score, v_total, v_corr;
end;
$$;

-- ---------------------------------------------------------------------------
-- Classement des supporters.
-- Points : pronostic gagnant = 3, pronostic joué = 1, bonne réponse de quiz = 1,
-- vote MVP = 1. Les identifiants ne sont jamais exposés : la ligne de
-- l'utilisateur courant est simplement marquée `is_me`.
create or replace function public.fan_points_raw()
returns table (
  user_id      uuid,
  points       bigint,
  predictions  bigint,
  correct      bigint,
  quiz_points  bigint,
  mvp_votes    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with preds as (
    select p.user_id,
           count(*) as played,
           count(*) filter (
             where (m.home_score > m.away_score and p.team_id = m.home_team_id)
                or (m.away_score > m.home_score and p.team_id = m.away_team_id)
           ) as correct
      from public.predictions p
      join public.matches m on m.id = p.match_id and m.status = 'finished'
     group by p.user_id
  ),
  quiz as (
    select user_id, sum(score)::bigint as pts from public.quiz_attempts group by user_id
  ),
  mvp as (
    select user_id, count(*)::bigint as votes from public.mvp_votes group by user_id
  ),
  ids as (
    select user_id from preds
    union select user_id from quiz
    union select user_id from mvp
  )
  select i.user_id,
         coalesce(p.correct, 0) * 3 + coalesce(p.played - p.correct, 0) * 1
           + coalesce(q.pts, 0) + coalesce(v.votes, 0) as points,
         coalesce(p.played, 0),
         coalesce(p.correct, 0),
         coalesce(q.pts, 0),
         coalesce(v.votes, 0)
    from ids i
    left join preds p on p.user_id = i.user_id
    left join quiz  q on q.user_id = i.user_id
    left join mvp   v on v.user_id = i.user_id;
$$;

drop function if exists public.fan_leaderboard(int);
create function public.fan_leaderboard(p_limit int default 50)
returns table (
  position_no bigint,
  name        text,
  points      bigint,
  predictions bigint,
  correct     bigint,
  is_me       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select row_number() over (order by f.points desc, pr.created_at),
         coalesce(nullif(btrim(pr.full_name), ''), 'Supporter'),
         f.points, f.predictions, f.correct,
         f.user_id = auth.uid()
    from public.fan_points_raw() f
    join public.profiles pr on pr.id = f.user_id
   where pr.show_in_leaderboard and f.points > 0
   order by f.points desc, pr.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

drop function if exists public.my_fan_stats();
create function public.my_fan_stats()
returns table (
  points      bigint,
  predictions bigint,
  correct     bigint,
  quiz_points bigint,
  mvp_votes   bigint,
  position_no bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with all_pts as (select * from public.fan_points_raw()),
  ranked as (
    select r.user_id, r.points, r.predictions, r.correct, r.quiz_points, r.mvp_votes,
           row_number() over (order by r.points desc) as pos
      from all_pts r
  )
  select ranked.points, ranked.predictions, ranked.correct,
         ranked.quiz_points, ranked.mvp_votes, ranked.pos
    from ranked where ranked.user_id = auth.uid();
$$;

revoke execute on function public.fan_points_raw() from anon, authenticated;
