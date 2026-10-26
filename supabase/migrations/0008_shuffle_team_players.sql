-- Reassign four registered players between two unplayed teams atomically.
-- This follows the current anon-key write model; the application has no ownership auth.
CREATE OR REPLACE FUNCTION public.shuffle_team_players(p_session_id uuid, p_assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_format text;
  v_mode text;
  v_status text;
  v_rows integer;
  v_players integer;
  v_from_teams integer;
  v_to_teams integer;
BEGIN
  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'A player shuffle must contain two to four changed assignments';
  END IF;
  SELECT format, participant_mode, status INTO v_format, v_mode, v_status
  FROM sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_status='completed' THEN RAISE EXCEPTION 'Competition is unavailable for player shuffling'; END IF;
  IF v_format NOT IN ('single_elimination','double_elimination','round_robin','group_knockout') THEN
    RAISE EXCEPTION 'Competition format does not support team player shuffling';
  END IF;
  IF v_mode='individual' OR (v_mode IS DISTINCT FROM 'team' AND NOT EXISTS (SELECT 1 FROM teams WHERE session_id=p_session_id)) THEN
    RAISE EXCEPTION 'Player shuffling is only available for team competitions';
  END IF;

  SELECT count(*), count(DISTINCT player_id), count(DISTINCT from_team_id), count(DISTINCT to_team_id)
  INTO v_rows,v_players,v_from_teams,v_to_teams
  FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid);
  IF v_rows NOT BETWEEN 2 AND 4 OR v_players<>v_rows OR v_from_teams<>2 OR v_to_teams<>2 THEN
    RAISE EXCEPTION 'A player shuffle must move two to four unique players between two teams';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
    WHERE player_id IS NULL OR from_team_id IS NULL OR to_team_id IS NULL OR from_team_id=to_team_id
  ) THEN RAISE EXCEPTION 'Each submitted player must change teams'; END IF;
  IF EXISTS (
    SELECT to_team_id FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
    EXCEPT
    SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
  ) OR EXISTS (
    SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
    EXCEPT
    SELECT to_team_id FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
  ) THEN RAISE EXCEPTION 'Players may only move between the two selected teams'; END IF;

  PERFORM 1 FROM team_members tm
  JOIN jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, from_position smallint) ON x.player_id=tm.player_id AND x.from_team_id=tm.team_id AND x.from_position IS NOT DISTINCT FROM tm.position
  WHERE tm.session_id=p_session_id FOR UPDATE;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'Team assignments changed since preview; refresh and try again'; END IF;

  IF EXISTS (
    SELECT x.player_id FROM jsonb_to_recordset(p_assignments) x(player_id uuid)
    WHERE (SELECT count(*) FROM team_members tm WHERE tm.session_id=p_session_id AND tm.player_id=x.player_id)<>1
  ) THEN RAISE EXCEPTION 'Each player must have exactly one team assignment in this competition'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, to_team_id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id=x.player_id AND p.session_id=p_session_id)
       OR NOT EXISTS (SELECT 1 FROM teams t WHERE t.id=x.from_team_id AND t.session_id=p_session_id)
       OR NOT EXISTS (SELECT 1 FROM teams t WHERE t.id=x.to_team_id AND t.session_id=p_session_id)
  ) THEN RAISE EXCEPTION 'Players and teams must belong to this competition'; END IF;

  -- Match results and live matches lock every player on the referenced teams.
  PERFORM 1 FROM matches WHERE session_id=p_session_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM matches m
    WHERE m.session_id=p_session_id
      AND (
        m.team1_id IN (SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid))
        OR m.team2_id IN (SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid))
        OR EXISTS (SELECT 1 FROM competition_participants cp WHERE cp.session_id=p_session_id AND cp.team_id IN (SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid)) AND cp.id IN (m.participant1_participant_id,m.participant2_participant_id))
      )
      AND (
        lower(coalesce(m.status,'')) IN ('completed','in_progress','bye')
        OR m.winner_team_id IS NOT NULL OR m.winner_participant_id IS NOT NULL
        OR m.score1 IS NOT NULL OR m.score2 IS NOT NULL
      )
  ) THEN RAISE EXCEPTION 'Players on teams with completed, active, bye, or recorded matches cannot be reassigned'; END IF;

  -- Ensure the assignment permutation preserves every selected team's roster size.
  IF EXISTS (
    SELECT t.id
    FROM teams t
    WHERE t.session_id=p_session_id
      AND t.id IN (
        SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid)
        UNION SELECT to_team_id FROM jsonb_to_recordset(p_assignments) x(to_team_id uuid)
      )
      AND (SELECT count(*) FROM team_members tm WHERE tm.session_id=p_session_id AND tm.team_id=t.id)
        <> (SELECT count(*) FROM team_members tm WHERE tm.session_id=p_session_id AND tm.team_id=t.id)
          - (SELECT count(*) FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid) WHERE x.from_team_id=t.id)
          + (SELECT count(*) FROM jsonb_to_recordset(p_assignments) x(to_team_id uuid) WHERE x.to_team_id=t.id)
  ) THEN RAISE EXCEPTION 'Shuffle must preserve each team capacity'; END IF;
  IF EXISTS (
    SELECT 1 FROM teams t
    WHERE t.session_id=p_session_id
      AND t.id IN (SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid))
      AND (SELECT count(*) FROM team_members tm WHERE tm.session_id=p_session_id AND tm.team_id=t.id)<>2
  ) THEN RAISE EXCEPTION 'Each selected team must have two registered players'; END IF;

  IF EXISTS (
    WITH final_roster AS (
      SELECT CASE WHEN x.player_id IS NULL THEN tm.team_id ELSE x.to_team_id END AS team_id,
        CASE WHEN x.player_id IS NULL THEN tm.position ELSE x.to_position END AS position
      FROM team_members tm
      LEFT JOIN jsonb_to_recordset(p_assignments) x(player_id uuid, to_team_id uuid, to_position smallint)
        ON x.player_id=tm.player_id
      WHERE tm.session_id=p_session_id
        AND tm.team_id IN (SELECT from_team_id FROM jsonb_to_recordset(p_assignments) x(from_team_id uuid))
    )
    SELECT 1 FROM final_roster WHERE position IS NOT NULL GROUP BY team_id,position HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Shuffle creates duplicate lineup positions'; END IF;

  UPDATE team_members tm SET position=NULL
  FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, from_position smallint)
  WHERE tm.session_id=p_session_id AND tm.player_id=x.player_id AND tm.team_id=x.from_team_id AND x.from_position IS NOT DISTINCT FROM tm.position;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'Team assignments changed during save'; END IF;

  UPDATE team_members tm SET team_id=x.to_team_id, position=x.to_position
  FROM jsonb_to_recordset(p_assignments) x(player_id uuid, from_team_id uuid, from_position smallint, to_team_id uuid, to_position smallint)
  WHERE tm.session_id=p_session_id AND tm.player_id=x.player_id AND tm.team_id=x.from_team_id AND tm.position IS NULL;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'Team assignments changed during save'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shuffle_team_players(uuid,jsonb) TO anon;
NOTIFY pgrst, 'reload schema';
