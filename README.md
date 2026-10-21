# Karambell

Karambell is a tournament management app for single-elimination competitions. It supports participant and team competitions, team pairing, brackets and byes, match results, winner advancement, champion display, and competition progress.

This project is distributed under the [MIT License](LICENSE). See the [changelog](CHANGELOG.md) for release notes.

The application uses React for its interface and Vite for development and production builds. Existing CSS, fonts, favicon, and visual styling are retained. `historypp` remains the only client-side routing engine.

## Architecture

```text
src/
  App.jsx                      application state and operations
  main.jsx                     React/Vite entry point
  components/                  competition and leaderboard views, bracket, dialogs
  config/                      active provider configuration
  domain/                      shared models, progress rules, and leaderboard aggregation
  providers/                   isolated Google Sheets and Supabase adapters
  router/                      small historypp-to-React integration
  services/                    centralized provider selection
  styles/                      existing application stylesheet
  libs/historypp/              pinned Git submodule
public/                         static assets and Netlify redirects
netlify/functions/api.mjs       Google Apps Script proxy for Netlify
server.js                       local Google Apps Script proxy and dist preview
```

`src/services/dataService.js` selects exactly one provider from `src/config/data.js`. The UI uses the same application-level operations for either provider. `src/providers/googleSheets.js` retains the Apps Script payloads and IDs; `src/providers/supabase.js` maps independently to the existing `sessions`, `players`, `teams`, `team_members`, and `matches` schema. There is no automatic provider fallback or synchronization.

The Supabase adapter assumes the column names currently documented in this repository. It does not run schema migrations. The browser uses only the configured public publishable/anon key; never put a service-role key in client configuration.

Provider selection and credentials are kept in one source file: `src/config/data.js`. `src/config/data.example.js` is a blank Google Sheets example. Set `dataProvider` to `"google-sheets"` or `"supabase"`; set `supabaseUrl` and `supabaseAnonKey` when Supabase is active. These values are bundled into the browser app, so only public values belong there. There are no Vite environment variables required by this app.

## historypp submodule

`historypp` is a UI-agnostic router that owns route matching, push/replace navigation, and browser back/forward handling. The adapter at `src/router/historyRouter.js` registers the existing routes using the library's `createEngine()` API and publishes route changes to React. The app keeps the existing route names and URL forms, including `/competitions/:sessionId`, `/participants/:sessionId`, `/bracket/:sessionId`, `/matches/:sessionId`, and legacy `/?session_id=...` links.

The submodule is `https://github.com/dimaspandu/historypp.git`, at `src/libs/historypp`, pinned to commit `c5acfe3cb5e71f551dad286c689a388b45405e56`. Pinning keeps builds reproducible; dependency installation, development, builds, and deployment never fetch a newer router revision.

Initialize it after cloning:

```bash
git submodule update --init --recursive
```

Inspect the pinned commit:

```bash
git submodule status
```

To intentionally update it, run the following maintenance command, then inspect the new commit and upstream changes, run tests and a production build, and verify routes:

```bash
git submodule update --remote src/libs/historypp
```

That update is manual. The parent repository's submodule reference should only be committed when explicitly authorized.

## Prerequisites and pnpm

- Node.js `>=20.19.0` (Netlify is configured to use Node.js `22.12.0`).
- pnpm `11.24.0`, pinned by the `packageManager` field in `package.json`.

pnpm is the only package manager for this project. Install dependencies:

```bash
pnpm install
```

The repository's `pnpm-workspace.yaml` permits the `esbuild` install script because Vite needs its platform binary. No historypp synchronization runs during install.

Run the Vite development server:

```bash
pnpm dev
```

Build and preview production output:

```bash
pnpm build
pnpm preview
```

Run automated tests:

```bash
pnpm test
```

### Clean checkout

```bash
git clone --recurse-submodules https://github.com/dimaspandu/karambell.git
cd karambell
git submodule update --init --recursive
pnpm install
```

Review `src/config/data.js`, then start development with `pnpm dev`.

## Local API proxy

The Vite development server proxies `/api` requests to `http://127.0.0.1:3000`. To use Google Sheets locally, run the proxy in a second terminal, then run Vite in the first:

```bash
node server.js
```

```bash
pnpm dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). `server.js` also serves the production `dist/` directory after a build. The Google Apps Script URL can be overridden for the local proxy with `APPS_SCRIPT_URL`.

Google Sheets keeps its existing `listSessions`, `getSession`, `createSession`, `addParticipant`, and `updateMatchScore` actions. Persisting competition status also calls `updateSessionStatus`, which updates the existing session status field. The contributor-ready Apps Script and provider-specific schemas are documented in [`docs/data-providers`](docs/data-providers/README.md). Deploy the checked-in `Code.gs` to Apps Script when updating an existing deployment. Netlify Functions use the `APPS_SCRIPT_URL` environment variable when configured, otherwise the existing default endpoint.

## Competition progress

Completed and bye matches count as decided. A competition is complete only when all matches are decided and the final has a winner. The same domain rule drives the card, details, champion, and both provider status updates. The Supabase adapter writes `sessions.status`; the Sheets adapter calls the status action above. No database or spreadsheet structure change is made by this app.

## Global leaderboard

The `/leaderboard` page aggregates teams from completed team tournaments. Open a team to see its global wins, losses, win rate, rank, and tournament history; open a tournament entry to see that team's ordered match history. Team and tournament detail URLs can be refreshed directly and participate in browser back/forward navigation.

Both configured providers feed the same shared domain aggregation. Teams are matched across tournaments by their two normalized player names, independent of order, spacing, and letter case. Rankings use unrounded win rates, followed by wins, tournaments played, and a deterministic identity key. Byes count as tournament participation and appear as informational history entries, but do not count as wins, losses, or played matches. Numeric scores are omitted because team-result score fields are not consistently actual game scores across providers.

The app does not have a global player registry: different people with identical normalized names may be combined, and a name change may split a team's history. Google Sheets encodes a team with `&`, so a player name containing that delimiter is ambiguous. See the [provider notes](docs/data-providers/README.md) for these identity limitations.

## Netlify deployment

Netlify runs `pnpm build` and publishes `dist/`. `vite.config.js` uses `/` as the production base and copies `public/`, including the favicon and `_redirects`, into the build. The SPA fallback serves `/index.html` for frontend routes, while `/api/*` remains handled by the Netlify Function configured in `netlify/functions/api.mjs`. Direct route refreshes are supported by the fallback rule in `netlify.toml` and `public/_redirects`.

Set `APPS_SCRIPT_URL` in Netlify Function environment settings only if using a different Apps Script deployment. Provider selection and Supabase public values remain in `src/config/data.js`; a redeploy is required after changing that file.

## Validation

`pnpm test` covers competition progress, provider-specific session-status persistence, leaderboard team identity normalization, aggregation across sessions, bye participation, ranking, and match history. `pnpm build` verifies the production Vite bundle. These checks do not contact live Google Sheets or Supabase, validate Supabase RLS, or exercise a deployed Netlify site.
