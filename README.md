# Karambell

Karambell is a React tournament management app for single elimination competitions. It supports individual and team competitions, brackets and byes, match results, winner advancement, competition progress, and a global team leaderboard.

## Data access

The app uses Supabase as its only data source. The flow is:

```text
React views → ViewModels → Competition repository → Supabase REST API
```

The repository validates operations and maps Supabase rows to the app's competition model. The Supabase data layer owns REST requests, table queries, and row mapping. It uses the existing `sessions`, `players`, `teams`, `team_members`, and `matches` schema documented in [docs/data-providers/supabase/schema.md](docs/data-providers/supabase/schema.md). The app does not create or migrate the schema.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment. These `VITE_` values are bundled for browsers, so use only the public anon or publishable key; never use a service-role key. Row Level Security and table policies must allow the intended client operations.

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

The `historypp` router is a Git submodule at `src/libs/historypp`, tracking the upstream `main` branch for updates. The current pinned commit is `60109d78b929be8b4f86582b7590824e68a2538e` (`v2.0.7`, engine `v1.0.6`). Initialize the recorded commit after cloning:

```bash
git submodule update --init --recursive
```

Submodules pin a commit so every checkout builds the same router version. To move Karambell to the latest upstream `main`, run this command, review the changes, then commit the updated submodule reference:

```bash
git submodule update --remote --merge src/libs/historypp
```

## Competition behavior

Completed and bye matches count as decided. A competition is complete only when all matches are decided and the final has a winner. Supabase stores match results in `matches.score1`, `score2`, and `winner_team_id`; team matches where users choose a winner do not invent numeric scores.

The global leaderboard aggregates teams from completed team competitions by their two normalized player names, independent of order, spacing, and letter case. Byes count as tournament participation and appear as informational history entries, but do not count as wins, losses, or played matches. The app has no global player registry, so identical normalized names may be combined and name changes may split a team's history.

## Deployment

Vercel project settings: Framework Preset **Vite**, Build Command `pnpm build`, Output Directory `dist`, Install Command `pnpm install`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment variables for each deployment environment, then redeploy. `vercel.json` provides the SPA fallback; the history router displays its existing not-found message for unknown paths. Netlify's equivalent configuration remains available in `netlify.toml` and `public/_redirects`. This app does not require an API proxy or server-side Supabase key.
