# Supabase data schema

# Supabase is Karambell's only data source. The browser app does not create or migrate its schema. Review the [Supabase schema reference](supabase/schema.md) against the target project before making schema changes.
# Global team identity limitation

The leaderboard identifies a team by its two normalized player names because there is no global player registry. Different people with the same normalized names can be merged, and a player name change can split historical records into separate identities. Team display names are formed by joining the two associated player names with `&`.
