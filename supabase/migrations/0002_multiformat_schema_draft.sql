-- Prepared using the Supabase catalog report supplied for Karambell production.
-- NOT executed from this workspace. The gate below checks the observed constraint
-- name/definition again before making any schema changes.
-- No application currently reads these additions; RLS is enabled deny-by-default
-- until reviewed policies are supplied in a separately reviewed policy migration.

BEGIN;

DO $verified_format_constraint$
DECLARE
  -- Verified from the supplied production preflight report.
  verified_constraint_name text := 'sessions_format_check';
  verified_constraint_definition text := 'CHECK (format = ''single_elimination''::text)';
  actual_definition text;
  session_rel oid := to_regclass('public.sessions');
  format_attnum smallint;
BEGIN
  IF session_rel IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.sessions is missing';
  END IF;
  SELECT attnum INTO format_attnum FROM pg_attribute
  WHERE attrelid=session_rel AND attname='format' AND attnum > 0 AND NOT attisdropped;
  IF format_attnum IS NULL THEN RAISE EXCEPTION 'Preflight failed: sessions.format is missing'; END IF;
  IF verified_constraint_name IS NULL OR verified_constraint_definition IS NULL THEN
    RAISE EXCEPTION 'Preflight gate: verified sessions.format constraint values are required';
  END IF;
  SELECT pg_get_constraintdef(oid, true) INTO actual_definition
  FROM pg_constraint
  WHERE conrelid=session_rel AND conname=verified_constraint_name
    AND contype='c' AND format_attnum = ANY(conkey);
  IF actual_definition IS NULL OR actual_definition IS DISTINCT FROM verified_constraint_definition THEN
    RAISE EXCEPTION 'Format check name/definition changed or was not verified; expected %, found %', verified_constraint_definition, actual_definition;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE format NOT IN
    ('single_elimination','double_elimination','round_robin','group_knockout')) THEN
    RAISE EXCEPTION 'Unexpected sessions.format values exist; resolve them before expansion';
  END IF;
  EXECUTE format('ALTER TABLE public.sessions DROP CONSTRAINT %I', verified_constraint_name);
END
$verified_format_constraint$;

ALTER TABLE public.sessions ALTER COLUMN format SET DEFAULT 'single_elimination';
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_format_multiformat_check
  CHECK (format IN ('single_elimination','double_elimination','round_robin','group_knockout'));

-- Nullable during staged rollout. Backfill and SET NOT NULL belong to 0003 after
-- participant-mode classification is reviewed; no existing session is rewritten here.
ALTER TABLE public.sessions ADD COLUMN participant_mode text;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_participant_mode_check
  CHECK (participant_mode IS NULL OR participant_mode IN ('team','individual'));

ALTER TABLE public.matches ADD COLUMN stage text NOT NULL DEFAULT 'main';
ALTER TABLE public.matches ADD COLUMN group_id uuid;
ALTER TABLE public.matches ADD CONSTRAINT matches_stage_multiformat_check
  CHECK (stage IN ('main','group','winners','losers','grand_final'));
ALTER TABLE public.matches ADD CONSTRAINT matches_group_stage_consistency_check
  CHECK ((stage = 'group') = (group_id IS NOT NULL));

-- Composite foreign keys below require a unique key in this exact column order.
-- Create a supporting index only when the catalog has no equivalent unique key.
DO $supporting_keys$
DECLARE
  rel oid := to_regclass('public.matches');
  key_attnums smallint[];
BEGIN
  IF rel IS NULL THEN RAISE EXCEPTION 'Required table public.matches is missing'; END IF;
  SELECT ARRAY[
    (SELECT attnum FROM pg_attribute WHERE attrelid=rel AND attname='session_id' AND attnum>0 AND NOT attisdropped),
    (SELECT attnum FROM pg_attribute WHERE attrelid=rel AND attname='id' AND attnum>0 AND NOT attisdropped)
  ]::smallint[] INTO key_attnums;
  IF array_position(key_attnums,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Required (session_id,id) columns are missing on public.matches';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid=rel AND i.indisunique AND i.indisvalid
      AND i.indnkeyatts=2
      AND i.indkey[0]=key_attnums[1] AND i.indkey[1]=key_attnums[2]
  ) THEN
    CREATE UNIQUE INDEX matches_session_id_id_multiformat_uidx ON public.matches(session_id,id);
  END IF;
END
$supporting_keys$;

-- Unified participant identity preserves the legacy team/player records and IDs.
-- participant_mode is intentionally duplicated on these rows only as the entity
-- discriminator; session configuration remains authoritative.
CREATE TABLE public.competition_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  participant_mode text NOT NULL CHECK (participant_mode IN ('team','individual')),
  team_id uuid,
  player_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competition_participants_source_xor_check CHECK (
    (participant_mode='team' AND team_id IS NOT NULL AND player_id IS NULL) OR
    (participant_mode='individual' AND player_id IS NOT NULL AND team_id IS NULL)
  ),
  CONSTRAINT competition_participants_session_id_id_key UNIQUE (session_id,id),
  -- Existing catalog reports UNIQUE (id,session_id) on both source tables, so use
  -- that key order and avoid adding redundant (session_id,id) source indexes.
  CONSTRAINT competition_participants_team_fk FOREIGN KEY (team_id,session_id) REFERENCES public.teams(id,session_id),
  CONSTRAINT competition_participants_player_fk FOREIGN KEY (player_id,session_id) REFERENCES public.players(id,session_id),
  CONSTRAINT competition_participants_team_source_key UNIQUE (session_id,team_id),
  CONSTRAINT competition_participants_player_source_key UNIQUE (session_id,player_id)
);

-- Use distinct names because the provider references undocumented legacy
-- participant1_id/participant2_id columns for individual matches.
ALTER TABLE public.matches ADD COLUMN participant1_participant_id uuid;
ALTER TABLE public.matches ADD COLUMN participant2_participant_id uuid;
ALTER TABLE public.matches ADD COLUMN winner_participant_id uuid;
ALTER TABLE public.matches ADD CONSTRAINT matches_participant1_session_fk
  FOREIGN KEY (session_id,participant1_participant_id) REFERENCES public.competition_participants(session_id,id);
ALTER TABLE public.matches ADD CONSTRAINT matches_participant2_session_fk
  FOREIGN KEY (session_id,participant2_participant_id) REFERENCES public.competition_participants(session_id,id);
ALTER TABLE public.matches ADD CONSTRAINT matches_winner_participant_session_fk
  FOREIGN KEY (session_id,winner_participant_id) REFERENCES public.competition_participants(session_id,id);

CREATE TABLE public.tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  group_number integer NOT NULL CHECK (group_number > 0),
  name text NOT NULL,
  qualifying_places integer CHECK (qualifying_places IS NULL OR qualifying_places > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_groups_session_id_id_key UNIQUE (session_id,id),
  CONSTRAINT tournament_groups_session_number_key UNIQUE (session_id,group_number)
);

CREATE TABLE public.tournament_group_members (
  session_id uuid NOT NULL,
  group_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,group_id,participant_id),
  CONSTRAINT tournament_group_members_group_fk FOREIGN KEY (session_id,group_id)
    REFERENCES public.tournament_groups(session_id,id),
  CONSTRAINT tournament_group_members_participant_fk FOREIGN KEY (session_id,participant_id)
    REFERENCES public.competition_participants(session_id,id),
  CONSTRAINT tournament_group_members_one_group_per_session UNIQUE (session_id,participant_id)
);

ALTER TABLE public.matches ADD CONSTRAINT matches_group_session_fk
  FOREIGN KEY (session_id,group_id) REFERENCES public.tournament_groups(session_id,id);

CREATE TABLE public.match_progressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  source_match_id uuid NOT NULL,
  source_outcome text NOT NULL CHECK (source_outcome IN ('winner','loser')),
  target_match_id uuid NOT NULL,
  target_slot smallint NOT NULL CHECK (target_slot IN (1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_progressions_source_outcome_key UNIQUE (session_id,source_match_id,source_outcome),
  CONSTRAINT match_progressions_target_slot_key UNIQUE (session_id,target_match_id,target_slot),
  CONSTRAINT match_progressions_source_fk FOREIGN KEY (session_id,source_match_id)
    REFERENCES public.matches(session_id,id),
  CONSTRAINT match_progressions_target_fk FOREIGN KEY (session_id,target_match_id)
    REFERENCES public.matches(session_id,id),
  CONSTRAINT match_progressions_no_self_edge CHECK (source_match_id <> target_match_id)
);

-- These are new public tables. RLS is deliberately enabled with no policies, which
-- denies PostgREST access until a separate policy stage has reviewed and installed
-- least-privilege policies. Do not copy policies from existing tables unexamined.
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_progressions ENABLE ROW LEVEL SECURITY;

-- No legacy progression is copied here. 0003 must validate references, duplicate
-- target slots, cross-session links, and cycles before backfilling winner edges.
-- Rerun is intentionally unsupported: duplicate columns/constraints must fail loudly.

COMMIT;
