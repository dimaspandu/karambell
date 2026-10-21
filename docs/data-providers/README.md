# Data provider schemas

Karambell keeps provider-specific storage formats separate. Use the documents here when setting up a development or production data source:

- [Google Sheets schema and Apps Script setup](google-sheets/README.md)
- [Supabase schema reference](supabase/schema.md)

The browser app does not create or migrate either schema. Keep changes to a provider's storage shape in its own documentation and adapter (`src/providers/googleSheets.js` or `src/providers/supabase.js`).
# Global team identity limitation

The leaderboard identifies a team by its two normalized player names because there is no global player registry. Different people with the same normalized names can be merged, and a player name change can split historical records into separate identities. Google Sheets stores a pair in one participant name using `&`; names containing that delimiter are ambiguous and malformed pairs are excluded from leaderboard aggregation.
