-- Backfill stage — run only after 0002 succeeds and its schema is verified.
-- Backfills participant_mode and unified participant identities without changing
-- legacy IDs, match IDs, scores, winners, statuses, or next_match links.
-- It deliberately aborts if mode/individual-slot mapping is ambiguous.

BEGIN;

DO $backfill_guard$
DECLARE
  individual_match_count bigint := 0;
  has_individual_slots boolean;
  has_team_slots boolean;
BEGIN
  IF to_regclass('public.competition_participants') IS NULL
     OR to_regclass('public.match_progressions') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: apply and verify the 0002 schema stage first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.competition_participants)
     OR EXISTS (SELECT 1 FROM public.sessions WHERE participant_mode IS NOT NULL) THEN
    RAISE EXCEPTION 'Backfill is not rerunnable: participant rows or modes already exist; inspect and reconcile manually';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_progressions) THEN
    RAISE EXCEPTION 'match_progressions is not empty; reconcile existing edges before legacy backfill';
  END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant2_id')
    INTO has_individual_slots;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='team1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='team2_id')
    INTO has_team_slots;
  IF NOT has_team_slots THEN RAISE EXCEPTION 'Expected legacy team1_id/team2_id columns are absent'; END IF;

  -- This classification is acceptable only after 0001 results are reviewed:
  -- any team rows means team mode; otherwise player rows mean individual mode.
  -- A session with matches but neither kind of participant is an error.
  IF EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.session_id=s.id)
      AND NOT EXISTS (SELECT 1 FROM public.players p WHERE p.session_id=s.id)
      AND EXISTS (SELECT 1 FROM public.matches m WHERE m.session_id=s.id)
  ) THEN RAISE EXCEPTION 'A session with fixtures has neither teams nor players'; END IF;

  IF has_individual_slots THEN
    EXECUTE 'SELECT count(*) FROM public.matches m
             JOIN public.sessions s ON s.id=m.session_id
             WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.session_id=s.id)
               AND (m.participant1_id IS NOT NULL OR m.participant2_id IS NOT NULL)'
      INTO individual_match_count;
  ELSE
    SELECT count(*) INTO individual_match_count
    FROM public.matches m
    WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.session_id=m.session_id);
  END IF;
  IF individual_match_count > 0 AND NOT has_individual_slots THEN
    RAISE EXCEPTION 'Individual fixtures exist but participant1_id/participant2_id were not found; stop and map verified source columns';
  END IF;

  -- Repeat the legacy-edge checks inside the migration transaction. A separate
  -- preflight result can go stale between inspection and application.
  IF EXISTS (
    SELECT 1 FROM public.matches src
    LEFT JOIN public.matches dst ON dst.id=src.next_match_id
    WHERE src.next_match_id IS NOT NULL
      AND (dst.id IS NULL OR src.session_id IS DISTINCT FROM dst.session_id)
  ) THEN RAISE EXCEPTION 'Legacy progression contains a missing or cross-session target'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE (next_match_id IS NULL) <> (next_slot IS NULL)
       OR (next_match_id IS NOT NULL AND next_slot NOT IN (1,2))
  ) THEN RAISE EXCEPTION 'Legacy progression contains a partial edge or invalid target slot'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE next_match_id IS NOT NULL
    GROUP BY session_id,next_match_id,next_slot
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Legacy progression assigns multiple sources to one target slot'; END IF;
  IF EXISTS (
    WITH RECURSIVE edge_walk(start_id,session_id,current_id,path,is_cycle) AS (
      SELECT m.id,m.session_id,m.next_match_id,
             ARRAY[m.id,m.next_match_id]::uuid[],m.next_match_id=m.id
      FROM public.matches m WHERE m.next_match_id IS NOT NULL
      UNION ALL
      SELECT w.start_id,w.session_id,current_match.next_match_id,
             w.path || current_match.next_match_id,
             current_match.next_match_id=ANY(w.path)
      FROM edge_walk w
      JOIN public.matches current_match
        ON current_match.id=w.current_id AND current_match.session_id=w.session_id
      WHERE NOT w.is_cycle AND current_match.next_match_id IS NOT NULL
    )
    SELECT 1 FROM edge_walk WHERE is_cycle
  ) THEN RAISE EXCEPTION 'Legacy progression contains a cycle'; END IF;
END
$backfill_guard$;

UPDATE public.sessions s SET participant_mode = CASE
  WHEN EXISTS (SELECT 1 FROM public.teams t WHERE t.session_id=s.id) THEN 'team'
  ELSE 'individual'
END;

INSERT INTO public.competition_participants (session_id,participant_mode,team_id)
SELECT t.session_id,'team',t.id FROM public.teams t
JOIN public.sessions s ON s.id=t.session_id AND s.participant_mode='team';

INSERT INTO public.competition_participants (session_id,participant_mode,player_id)
SELECT p.session_id,'individual',p.id FROM public.players p
JOIN public.sessions s ON s.id=p.session_id AND s.participant_mode='individual';

-- Existing team fixture mapping.
UPDATE public.matches m SET
  participant1_participant_id = (SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.team_id=m.team1_id),
  participant2_participant_id = (SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.team_id=m.team2_id),
  winner_participant_id = (SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.team_id=m.winner_team_id)
WHERE EXISTS (SELECT 1 FROM public.sessions s WHERE s.id=m.session_id AND s.participant_mode='team');

-- Individual source columns are undocumented in the repository schema. Their
-- existence is checked above; verify their types and meaning from 0001 output.
DO $individual_backfill$
DECLARE has_individual_slots boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant2_id')
    INTO has_individual_slots;
  IF has_individual_slots THEN
    EXECUTE $sql$
      UPDATE public.matches m SET
        participant1_participant_id=(SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.player_id=m.participant1_id),
        participant2_participant_id=(SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.player_id=m.participant2_id),
        winner_participant_id=(SELECT p.id FROM public.competition_participants p WHERE p.session_id=m.session_id AND p.player_id=m.winner_team_id)
      WHERE EXISTS (SELECT 1 FROM public.sessions s WHERE s.id=m.session_id AND s.participant_mode='individual')
    $sql$;
  END IF;
END
$individual_backfill$;

-- Fail atomically if any populated legacy slot/winner could not be mapped.
DO $mapping_check$
DECLARE has_individual_slots boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.matches m JOIN public.sessions s ON s.id=m.session_id
    WHERE s.participant_mode='team' AND (
      (m.team1_id IS NOT NULL AND m.participant1_participant_id IS NULL) OR
      (m.team2_id IS NOT NULL AND m.participant2_participant_id IS NULL) OR
      (m.winner_team_id IS NOT NULL AND m.winner_participant_id IS NULL)
    )) THEN RAISE EXCEPTION 'One or more legacy team match references could not be mapped'; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name='participant2_id')
    INTO has_individual_slots;
  IF has_individual_slots THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1 FROM public.matches m JOIN public.sessions s ON s.id=m.session_id
        WHERE s.participant_mode='individual' AND (
          (m.participant1_id IS NOT NULL AND m.participant1_participant_id IS NULL) OR
          (m.participant2_id IS NOT NULL AND m.participant2_participant_id IS NULL) OR
          (m.winner_team_id IS NOT NULL AND m.winner_participant_id IS NULL)
        )
      )
    $sql$ INTO has_individual_slots;
    IF has_individual_slots THEN RAISE EXCEPTION 'One or more legacy individual match references could not be mapped'; END IF;
  END IF;
END
$mapping_check$;

-- Copy the verified legacy winner edges without changing next_match_id/next_slot.
-- Any unexpected unique/FK conflict aborts the transaction; no row is silently skipped.
INSERT INTO public.match_progressions
  (session_id,source_match_id,source_outcome,target_match_id,target_slot)
SELECT session_id,id,'winner',next_match_id,next_slot
FROM public.matches
WHERE next_match_id IS NOT NULL;

-- Do not SET participant_mode NOT NULL or add the completed-winner check until the
-- application has switched reads/writes atomically to the unified participant IDs.
COMMIT;
