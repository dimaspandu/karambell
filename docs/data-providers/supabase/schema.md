# Supabase schema reference

This documents the Supabase schema used by Karambell. It is a reference for the current data-access layer, not a migration script; review it against the target project's live database before making schema changes. Configure Row Level Security and policies separately before exposing tables through the Supabase REST API.

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

## Adapter mapping

The Supabase data layer uses `sessions.id` as the session identifier and `matches.id` as the match identifier. Match-facing participant IDs use `competition_participants.id`; team/player names resolve through its `team_id`/`player_id` source and existing `team_members` rows. During compatibility rollout, team match writes also maintain legacy `team1_id`, `team2_id`, and `winner_team_id`. Scores remain in `score1` and `score2`.

`tournament_groups` and `tournament_group_members` store group-stage definitions and membership; the current UI does not use them yet. `match_progressions` stores winner/loser outcome links. The current single-elimination adapter reads winner links and writes them alongside legacy `next_match_id`/`next_slot` fields.

Migration `0005_multiformat_api_policies.sql` grants anon CRUD access to the new tables, matching the existing public-access model. These policies do not provide per-user isolation.
