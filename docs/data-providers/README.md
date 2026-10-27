# Data providers

Karambell currently uses Supabase as its only data source. The browser app does not create or migrate the database schema. See the [Supabase schema guide](supabase/schema.md) and the [catalog snapshot](../../supabase/schema.sql). The SQL snapshot is for reference only; compare it with the live Supabase project before making changes.

The leaderboard identifies a team by its two normalized player names because there is no global player registry. Different people with the same normalized names can be merged, and a player name change can split historical records into separate identities. Team display names are formed by joining the two associated player names with `&`.
