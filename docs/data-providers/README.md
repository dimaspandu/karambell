# Data provider schemas

Karambell keeps provider-specific storage formats separate. Use the documents here when setting up a development or production data source:

- [Google Sheets schema and Apps Script setup](google-sheets/README.md)
- [Supabase schema reference](supabase/schema.md)

The browser app does not create or migrate either schema. Keep changes to a provider's storage shape in its own documentation and adapter (`src/providers/googleSheets.js` or `src/providers/supabase.js`).
