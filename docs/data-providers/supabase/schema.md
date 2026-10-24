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
| `format` | `text` | Not null; default and only allowed value: `single_elimination` |
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

## Adapter mapping

The Supabase data layer uses `sessions.id` as the session identifier, and `matches.id` as the match identifier. Team brackets use `matches.team1_id`, `team2_id`, and `winner_team_id`; scores remain in `score1` and `score2`. Team player names are resolved through `team_members` to `players`.
