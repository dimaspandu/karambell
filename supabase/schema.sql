-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_date date,
  location text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'registration'::text, 'in_progress'::text, 'completed'::text])),
  format text NOT NULL DEFAULT 'single_elimination'::text CHECK (format = ANY (ARRAY['single_elimination'::text, 'double_elimination'::text, 'round_robin'::text, 'group_knockout'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  participant_mode text CHECK (participant_mode IS NULL OR (participant_mode = ANY (ARRAY['team'::text, 'individual'::text]))),
  CONSTRAINT sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  name text,
  seed integer CHECK (seed > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.team_members (
  session_id uuid NOT NULL,
  team_id uuid NOT NULL,
  player_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  position smallint CHECK ("position" IS NULL OR ("position" = ANY (ARRAY[1, 2]))),
  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, player_id),
  CONSTRAINT team_members_team_id_session_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_team_id_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.teams(session_id),
  CONSTRAINT team_members_player_id_session_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id),
  CONSTRAINT team_members_player_id_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.players(session_id)
);
CREATE TABLE public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  round integer NOT NULL CHECK (round > 0),
  match_number integer NOT NULL CHECK (match_number > 0),
  team1_id uuid,
  team2_id uuid,
  winner_team_id uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'bye'::text])),
  next_match_id uuid,
  next_slot smallint CHECK (next_slot = ANY (ARRAY[1, 2])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  score1 smallint,
  score2 smallint,
  stage text NOT NULL DEFAULT 'main'::text CHECK (stage = ANY (ARRAY['main'::text, 'group'::text, 'winners'::text, 'losers'::text, 'grand_final'::text])),
  group_id uuid,
  participant1_participant_id uuid,
  participant2_participant_id uuid,
  winner_participant_id uuid,
  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_participant1_session_fk FOREIGN KEY (participant1_participant_id) REFERENCES public.competition_participants(id),
  CONSTRAINT matches_participant1_session_fk FOREIGN KEY (session_id) REFERENCES public.competition_participants(session_id),
  CONSTRAINT matches_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT matches_next_match_id_fkey FOREIGN KEY (next_match_id) REFERENCES public.matches(id),
  CONSTRAINT matches_team1_id_session_id_fkey FOREIGN KEY (team1_id) REFERENCES public.teams(id),
  CONSTRAINT matches_team1_id_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.teams(session_id),
  CONSTRAINT matches_team2_id_session_id_fkey FOREIGN KEY (team2_id) REFERENCES public.teams(id),
  CONSTRAINT matches_team2_id_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.teams(session_id),
  CONSTRAINT matches_winner_team_id_session_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id),
  CONSTRAINT matches_winner_team_id_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.teams(session_id),
  CONSTRAINT matches_participant2_session_fk FOREIGN KEY (participant2_participant_id) REFERENCES public.competition_participants(id),
  CONSTRAINT matches_participant2_session_fk FOREIGN KEY (session_id) REFERENCES public.competition_participants(session_id),
  CONSTRAINT matches_winner_participant_session_fk FOREIGN KEY (winner_participant_id) REFERENCES public.competition_participants(id),
  CONSTRAINT matches_winner_participant_session_fk FOREIGN KEY (session_id) REFERENCES public.competition_participants(session_id),
  CONSTRAINT matches_group_session_fk FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id),
  CONSTRAINT matches_group_session_fk FOREIGN KEY (session_id) REFERENCES public.tournament_groups(session_id)
);
CREATE TABLE public.competition_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  participant_mode text NOT NULL CHECK (participant_mode = ANY (ARRAY['team'::text, 'individual'::text])),
  team_id uuid,
  player_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT competition_participants_pkey PRIMARY KEY (id),
  CONSTRAINT competition_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT competition_participants_team_fk FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT competition_participants_team_fk FOREIGN KEY (session_id) REFERENCES public.teams(session_id),
  CONSTRAINT competition_participants_player_fk FOREIGN KEY (player_id) REFERENCES public.players(id),
  CONSTRAINT competition_participants_player_fk FOREIGN KEY (session_id) REFERENCES public.players(session_id)
);
CREATE TABLE public.tournament_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  group_number integer NOT NULL CHECK (group_number > 0),
  name text NOT NULL,
  qualifying_places integer CHECK (qualifying_places IS NULL OR qualifying_places > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tournament_groups_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_groups_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.tournament_group_members (
  session_id uuid NOT NULL,
  group_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tournament_group_members_pkey PRIMARY KEY (session_id, group_id, participant_id),
  CONSTRAINT tournament_group_members_group_fk FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id),
  CONSTRAINT tournament_group_members_group_fk FOREIGN KEY (session_id) REFERENCES public.tournament_groups(session_id),
  CONSTRAINT tournament_group_members_participant_fk FOREIGN KEY (participant_id) REFERENCES public.competition_participants(id),
  CONSTRAINT tournament_group_members_participant_fk FOREIGN KEY (session_id) REFERENCES public.competition_participants(session_id)
);
CREATE TABLE public.match_progressions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  source_match_id uuid NOT NULL,
  source_outcome text NOT NULL CHECK (source_outcome = ANY (ARRAY['winner'::text, 'loser'::text])),
  target_match_id uuid NOT NULL,
  target_slot smallint NOT NULL CHECK (target_slot = ANY (ARRAY[1, 2])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_progressions_pkey PRIMARY KEY (id),
  CONSTRAINT match_progressions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT match_progressions_source_fk FOREIGN KEY (source_match_id) REFERENCES public.matches(id),
  CONSTRAINT match_progressions_source_fk FOREIGN KEY (session_id) REFERENCES public.matches(session_id),
  CONSTRAINT match_progressions_target_fk FOREIGN KEY (target_match_id) REFERENCES public.matches(id),
  CONSTRAINT match_progressions_target_fk FOREIGN KEY (session_id) REFERENCES public.matches(session_id)
);