# Supabase schema reference

This documents the tables used by Karambell's current Supabase data-access layer. [`supabase/schema.sql`](../../../supabase/schema.sql) is a catalog snapshot supplied from the project database, not a migration or setup script. It is explicitly marked context-only and its dumped foreign-key clauses are not guaranteed to be executable as written. Compare both references with the live project before making schema changes. Configure Row Level Security and policies separately before exposing tables through the Supabase REST API; the snapshot does not document RLS policies.

## `public.sessions`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `name` | `text` | Not null |
| `event_date` | `date` | Nullable |
| `location` | `text` | Nullable |
| `status` | `text` | Not null; default `draft`; allowed: `draft`, `registration`, `in_progress`, `completed` |
| `format` | `text` | Not null; default `single_elimination`; allowed: `single_elimination`, `double_elimination`, `round_robin`, `group_knockout` |
| `participant_mode` | `text` | Nullable during rollout; `team` or `individual` |
| `created_at` | `timestamptz` | Not null; default `now()` |
| `updated_at` | `timestamptz` | Not null; default `now()` |

## `public.players`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `session_id` | `uuid` | Not null; references `sessions.id` |
| `name` | `text` | Not null |
| `created_at` | `timestamptz` | Not null; default `now()` |

## `public.teams`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `session_id` | `uuid` | Not null; references `sessions.id` |
| `name` | `text` | Nullable |
| `seed` | `integer` | Nullable; if set, greater than zero |
| `created_at` | `timestamptz` | Not null; default `now()` |

## `public.team_members`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `session_id` | `uuid` | Not null; identifies the owning session |
| `team_id` | `uuid` | Not null; references `teams.id` |
| `player_id` | `uuid` | Not null; references `players.id` |
| `created_at` | `timestamptz` | Not null; default `now()` |
| `position` | `smallint` | Nullable; if set, `1` or `2` |

Primary key: (`team_id`, `player_id`). The adapter writes `session_id`, `team_id`, `player_id`, and `position` when creating a team.

## `public.matches`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `session_id` | `uuid` | Not null; references `sessions.id` |
| `round` | `integer` | Not null; greater than zero |
| `match_number` | `integer` | Not null; greater than zero |
| `team1_id` | `uuid` | Nullable; references `teams.id` |
| `team2_id` | `uuid` | Nullable; references `teams.id` |
| `winner_team_id` | `uuid` | Nullable; references `teams.id` |
| `status` | `text` | Not null; default `pending`; allowed: `pending`, `completed`, `bye` |
| `next_match_id` | `uuid` | Nullable; references `matches.id` |
| `next_slot` | `smallint` | Nullable; if set, `1` or `2` |
| `created_at` | `timestamptz` | Not null; default `now()` |
| `updated_at` | `timestamptz` | Not null; default `now()` |
| `score1` | `smallint` | Nullable |
| `score2` | `smallint` | Nullable |
| `stage` | `text` | Not null; default `main`; allowed: `main`, `group`, `winners`, `losers`, `grand_final` |
| `group_id` | `uuid` | Nullable; references `tournament_groups` within the same session |
| `participant1_participant_id` | `uuid` | Nullable; references `competition_participants` within the same session |
| `participant2_participant_id` | `uuid` | Nullable; references `competition_participants` within the same session |
| `winner_participant_id` | `uuid` | Nullable; references `competition_participants` within the same session |

## `public.competition_participants`

One row represents the participant identity used by a competition, backed by either a team or an individual player.

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `session_id` | `uuid` | Not null; references `sessions.id` |
| `participant_mode` | `text` | Not null; `team` or `individual` |
| `team_id` | `uuid` | Nullable; references `teams.id` |
| `player_id` | `uuid` | Nullable; references `players.id` |
| `created_at` | `timestamptz` | Not null; default `now()` |

## `public.tournament_groups`

| Column | Type | Null/default/constraint |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` |
| `session_id` | `uuid` | Not null; references `sessions.id` |
| `group_number` | `integer` | Not null; greater than zero |
| `name` | `text` | Not null |
| `qualifying_places` | `integer` | Nullable; if set, greater than zero |
| `created_at` | `timestamptz` | Not null; default `now()` |

## `public.tournament_group_members`

Membership rows connect a competition participant to a group. The snapshot shows `session_id`, `group_id`, `participant_id`, and `created_at`; the intended key is the combination of session, group, and participant.

## `public.match_progressions`

Progression rows connect an outcome in one match to a slot in another. The snapshot shows `id`, `session_id`, `source_match_id`, `source_outcome`, `target_match_id`, `target_slot`, and `created_at`. `source_outcome` is `winner` or `loser`; `target_slot` is `1` or `2`.

## Adapter mapping

The Supabase data layer uses `sessions.id` as the session identifier and `matches.id` as the match identifier. Match-facing participant IDs use `competition_participants.id`; team/player names resolve through its `team_id`/`player_id` source and existing `team_members` rows. During compatibility rollout, team match writes also maintain legacy `team1_id`, `team2_id`, and `winner_team_id`. Scores remain in `score1` and `score2`.

`tournament_groups` and `tournament_group_members` store group-stage definitions and membership. The application supports single elimination, double elimination, round robin, and group + knockout for team competitions. Round-robin standings are calculated from completed wins (three points per win; ties are not supported). Group + knockout advances the top two teams from each group, ordered by wins, head-to-head when exactly two teams are tied, then seed. Double elimination requires a power-of-two field and uses one grand final without a reset match. `match_progressions` stores winner/loser outcome links; winner links are also mirrored to legacy `next_match_id`/`next_slot` fields for compatibility.

The scripts under `supabase/migrations/` are manually applied SQL artifacts, not an automatically managed migration history. Several are staged rollout drafts and should not be run as a fresh install sequence. `0008_shuffle_team_players.sql` defines the `shuffle_team_players` RPC called by the browser provider. Review any script against the live database and current application before applying it. The application uses the public anon key and does not provide per-user isolation; configure database grants and RLS deliberately for the deployment.

The local `supabase/backup/` directory contains row exports and is excluded from Git. Keep database backups outside the source repository and use the database provider's backup facilities for recovery.
