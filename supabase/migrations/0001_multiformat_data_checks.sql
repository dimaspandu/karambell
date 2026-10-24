-- READ ONLY DATA CHECKS.
-- First inspect 0001_multiformat_preflight.sql. Run each SELECT block separately
-- in Supabase SQL Editor so each result grid is visible and can be saved.
-- These queries require the documented tables/columns to exist.

-- 1. Per-session participant counts. Players may coexist with teams in team mode
-- because team_members refers to players; do not infer mode from player_count alone.
SELECT s.id AS session_id, s.format, s.status,
       (SELECT count(*) FROM public.teams t WHERE t.session_id=s.id) AS team_count,
       (SELECT count(*) FROM public.players p WHERE p.session_id=s.id) AS player_count,
       (SELECT count(*) FROM public.matches m WHERE m.session_id=s.id) AS match_count
FROM public.sessions s
ORDER BY s.id;

-- 2. Team-member rows whose session disagrees with the referenced team/player.
SELECT tm.session_id, tm.team_id, tm.player_id,
       t.session_id AS team_session_id, p.session_id AS player_session_id
FROM public.team_members tm
LEFT JOIN public.teams t ON t.id=tm.team_id
LEFT JOIN public.players p ON p.id=tm.player_id
WHERE t.id IS NULL OR p.id IS NULL
   OR tm.session_id IS DISTINCT FROM t.session_id
   OR tm.session_id IS DISTINCT FROM p.session_id;

-- 3. Legacy next-match links that are missing or cross-session.
SELECT src.id AS source_match_id, src.session_id,
       src.next_match_id, dst.session_id AS target_session_id
FROM public.matches src
LEFT JOIN public.matches dst ON dst.id=src.next_match_id
WHERE src.next_match_id IS NOT NULL
  AND (dst.id IS NULL OR src.session_id IS DISTINCT FROM dst.session_id);

-- 4. Invalid or partial edge data.
SELECT id, session_id, next_match_id, next_slot
FROM public.matches
WHERE (next_match_id IS NULL) <> (next_slot IS NULL)
   OR (next_match_id IS NOT NULL AND next_slot NOT IN (1,2));

-- 5. Multiple incoming sources assigned to the same target slot.
SELECT src.session_id, src.next_match_id AS target_match_id,
       src.next_slot, count(*) AS source_count,
       array_agg(src.id ORDER BY src.id) AS source_match_ids
FROM public.matches src
WHERE src.next_match_id IS NOT NULL
GROUP BY src.session_id, src.next_match_id, src.next_slot
HAVING count(*) > 1;

-- 6. Cycles in same-session next_match links. The path guard terminates at the
-- first repeated ID and reports the start and repeated target for review.
WITH RECURSIVE walk(start_match_id, session_id, next_match_id, path, is_cycle) AS (
  SELECT m.id, m.session_id, m.next_match_id,
         ARRAY[m.id]::uuid[], m.next_match_id=m.id
  FROM public.matches m
  WHERE m.next_match_id IS NOT NULL
  UNION ALL
  SELECT w.start_match_id, w.session_id, m.next_match_id,
         w.path || m.id, m.next_match_id=ANY(w.path)
  FROM walk w
  JOIN public.matches m
    ON m.id=w.next_match_id AND m.session_id=w.session_id
  WHERE NOT w.is_cycle AND w.next_match_id IS NOT NULL
)
SELECT start_match_id, session_id, path, next_match_id AS repeated_match_id
FROM walk
WHERE is_cycle;

-- 7. Individual-slot schema capability. This is safe even when either legacy
-- participant column is absent; it reports names/types, not presumed row values.
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='matches'
  AND column_name IN ('participant1_id','participant2_id','winner_id',
                      'team1_id','team2_id','winner_team_id')
ORDER BY column_name;
