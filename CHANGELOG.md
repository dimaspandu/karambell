# Changelog

Notable changes to Karambell are documented here.

## [1.0.2] - 2026-10-24

### Changed

- Made Supabase the application's only data source and removed provider selection.
- Updated competition and match state immediately after successful winner changes, including downstream bracket updates.
- Hide winner-change actions after the tournament is complete.

### Removed

- Retired the Google Sheets adapter, Apps Script proxy and setup documentation.

## [1.0.1] - 2026-10-21

### Added

- Global leaderboard for completed team tournaments, with normalized cross-tournament team identity and deterministic ranking.
- Team detail, tournament history, and ordered match history views with bye-aware participation statistics.
- Provider-independent leaderboard aggregation for Supabase and Google Sheets, with paginated Supabase session retrieval.
- Tests for team identity normalization, aggregation, byes, ranking, and match history.

### Changed

- Updated the README with leaderboard behavior, routes, validation coverage, and known team identity limitations.
- Clarified decorative sidebar icon markup for consistent accessible navigation.

## [1.0.0] - 2026-10-21

### Added

- Public MIT license.
- React and Vite application setup with pnpm workflows and Netlify deployment configuration.
- Competition management for individual and team single-elimination tournaments, including pair creation, brackets, match scoring, winner advancement, champion display, and progress tracking.
- Isolated Google Sheets and Supabase data provider adapters.
- Google Sheets schema documentation and a contributor-ready Apps Script, including persistent session status updates.
- Supabase schema reference and provider setup documentation.
- Path-based SPA routing backed by the `historypp` submodule.
- Tests for competition completion, byes, pending matches, and provider-specific status persistence.

### Changed

- Migrated the application interface and routing integration from the previous vanilla JavaScript setup to React and Vite while retaining the established visual styling and route URLs.
- Updated Netlify to build the Vite app and publish its `dist/` output with SPA fallback routing.
