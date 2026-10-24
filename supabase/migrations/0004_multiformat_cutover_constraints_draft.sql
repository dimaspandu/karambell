-- DRAFT ONLY — apply only after the application uses unified participant columns
-- for every match read/write, and after 0003 has been verified on staging.
-- Do not apply during legacy-app operation: old writes do not populate the new IDs.

BEGIN;

-- A completed match must name a winner occupying exactly one of its two participant
-- slots. One occupied slot supports existing bye matches. NOT VALID avoids rewriting
-- historic rows during rollout but enforces the rule for new/updated rows.
ALTER TABLE public.matches ADD CONSTRAINT matches_completed_winner_is_slot_check
CHECK (
  status <> 'completed' OR (
    winner_participant_id IS NOT NULL AND
    (COALESCE(winner_participant_id=participant1_participant_id,false)
      OR COALESCE(winner_participant_id=participant2_participant_id,false)) AND
    participant1_participant_id IS DISTINCT FROM participant2_participant_id
  )
) NOT VALID;

-- Validate only after the backfill report shows no invalid completed result.
-- ALTER TABLE public.matches VALIDATE CONSTRAINT matches_completed_winner_is_slot_check;

-- This trigger prevents casual format/mode edits after any fixture exists. Fixture
-- creation and configuration updates still need a transactional workflow that locks
-- the session row; this trigger alone cannot prevent a concurrent insert/update race.
CREATE OR REPLACE FUNCTION public.prevent_tournament_configuration_change_after_fixtures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF (NEW.format IS DISTINCT FROM OLD.format
      OR NEW.participant_mode IS DISTINCT FROM OLD.participant_mode)
     AND EXISTS (SELECT 1 FROM public.matches m WHERE m.session_id=OLD.id) THEN
    RAISE EXCEPTION 'Tournament format and participant mode cannot change after fixtures exist'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.prevent_tournament_configuration_change_after_fixtures() FROM PUBLIC;
DROP TRIGGER IF EXISTS sessions_configuration_lock_after_fixtures ON public.sessions;
CREATE TRIGGER sessions_configuration_lock_after_fixtures
BEFORE UPDATE OF format, participant_mode ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_tournament_configuration_change_after_fixtures();

COMMIT;
