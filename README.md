# Karambell

Karambell is a React tournament management app for single elimination competitions. It supports individual and team competitions, brackets and byes, match results, winner advancement, competition progress, and a global team leaderboard.

## Data access

The app uses Supabase as its only data source. The flow is:

```text
React views → ViewModels → Competition repository → Supabase REST API
```

The repository validates operations and maps Supabase rows to the app's competition model. The Supabase data layer owns REST requests, table queries, and row mapping. It uses the existing `sessions`, `players`, `teams`, `team_members`, and `matches` schema documented in [docs/data-providers/supabase/schema.md](docs/data-providers/supabase/schema.md). The app does not create or migrate the schema.

Set `supabaseUrl` and `supabaseAnonKey` in `src/config/data.js`. The browser bundle may contain only the public anon or publishable key; never put a service-role key in client code. Row Level Security and table policies must allow the intended client operations.

## Development

Requirements: Node.js `>=20.19.0` and pnpm `11.24.0`.

```bash
pnpm install
pnpm dev
```

Run checks and build the production bundle:

```bash
pnpm test
pnpm build
```

The `historypp` router is a pinned Git submodule at `src/libs/historypp`. Initialize it after cloning:

```bash
git submodule update --init --recursive
```

## Competition behavior

Completed and bye matches count as decided. A competition is complete only when all matches are decided and the final has a winner. Supabase stores match results in `matches.score1`, `score2`, and `winner_team_id`; team matches where users choose a winner do not invent numeric scores.

The global leaderboard aggregates teams from completed team competitions by their two normalized player names, independent of order, spacing, and letter case. Byes count as tournament participation and appear as informational history entries, but do not count as wins, losses, or played matches. The app has no global player registry, so identical normalized names may be combined and name changes may split a team's history.

## Deployment

Netlify runs `pnpm build` and publishes `dist/`. The SPA fallback in `netlify.toml` and `public/_redirects` supports direct route refreshes. Supabase public configuration is bundled from `src/config/data.js`; redeploy after changing it. This app does not require an API proxy or server-side Supabase key.
