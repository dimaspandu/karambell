# Changelog

All notable changes to this project will be documented in this file.

---

## [2.0.6] - 2026-09-30

### Added
- Added a `.gitignore` covering editor directories (`.vscode/`, `.idea/`) and AI agent tooling folders (`.kilo/`, `.claude/`, `.cursor/`, `.opencode/`, `.codex/`, `.agents/`, `.gemini/`, `.windsurf/`, `.continue/`), plus `node_modules/`, build output, logs, and environment files.

### Removed
- Removed the local `.kilo/` agent workspace directory from the repository.
- Removed the local `.vscode/` editor configuration directory from the repository.

---

## [2.0.5] - 2026-05-20

### Changed
- Aligned the landing page copy with the README project description.
- Replaced unrelated framework-oriented messaging with URL-driven routing and lifecycle language.
- Added a basic route registration code snapshot to the landing page.

---

## [2.0.4] - 2026-05-19

### Added
- Added simplified documentation pages for project docs and architecture.
- Added fullscreen diagram previews on the architecture documentation page.
- Added the live documentation link to the README.

### Changed
- Redesigned the root landing page with a simpler documentation-style layout.
- Increased typography sizes across the landing page, architecture docs, and examples index for better readability.
- Updated docs and examples routing support for local preview and Netlify deployment.
- Moved architecture diagrams into the architecture documentation folder.

### Fixed
- Updated README server instructions to match the current landing-page default.
- Updated README diagram references to the current architecture documentation paths.

---

## [2.0.3] - 2026-05-19

### Changed
- Updated example module script paths to load `/src/index.js` from the site root.
- Reordered Netlify redirects so nested example routes are handled before the root SPA fallback.

### Fixed
- Fixed local server path resolution for root-relative asset and module requests.
- Prevented file requests with extensions from falling back to HTML responses.

---

## [2.0.2] - 2026-05-13

### Added
- Added SEO-friendly meta tags and Open Graph meta tags to root index.html for better search engine optimization and social media sharing
- Added _redirects file for Netlify SPA deployment support to handle client-side routing refreshes
- Added assets/featured-image.png for Open Graph image

### Changed
- Moved favicon.svg to assets/favicon.svg for better asset organization
- Updated all example HTML files to reference the new favicon path in assets/

---

## [2.0.0] - 2026-05-12

### Added
- Introduced fully modular ESM-based router architecture (`src/1.0.5`)
- Added separated internal modules for:
  - core state
  - navigation
  - route matching
  - middleware pipeline
  - browser event handling
  - utilities
- Added reusable matcher modules:
  - `simple-matcher.mjs`
  - `trie-matcher.mjs`
  - `match-route.mjs`
- Added reusable navigation modules:
  - `run.mjs`
  - `guards.mjs`
  - `navigation.mjs`
- Added reusable middleware runner module:
  - `run-middlewares.mjs`
- Added reusable utility modules:
  - `path.mjs`
  - `query.mjs`
- Added reusable browser adapter module:
  - `browser/events.mjs`
- Added root landing page (`/index.html`) for project showcase and hosting
- Added redesigned examples landing page with responsive card-based UI
- Added improved project server architecture with root-level `server.js`

### Changed
- Core router API now uses `historypp.*` instead of patching native `window.history`
- Migrated examples toward ESM module usage
- Refactored routing engine into composable modules for improved maintainability
- Improved browser navigation rollback handling for blocked `popstate` transitions
- Enhanced route lifecycle orchestration flow
- Updated server routing behavior to better support:
  - nested SPA routes
  - HTML hybrid navigation
  - fragment fetching
  - deep-link refresh handling

### Fixed
- Fixed blocked browser back navigation causing broken history stacks
- Fixed rollback behavior when `canLeave()` rejects `popstate` navigation
- Fixed route refresh issues on nested paths ending with trailing slashes
- Fixed HTML fragment loading issues in hybrid navigation examples

### Notes
- This release represents the largest architectural refactor since the initial prototype.
- The router is now structured for long-term scalability, isolated unit testing, future adapters, and potential npm distribution.
- Native `window.history` is no longer monkey-patched in the new ESM architecture.

---

## [1.9.2] - 2026-05-08

### Changed
- Core upgrade to v1.0.5 with enhanced testing capabilities and Node.js compatibility
- Added package.json with "type": "module" for proper ESM support
- Updated diagram references in README.md to version 1.0.5
- Corrected import path in tests README.md

### Notes
- This release includes internal refactoring for better module handling and documentation updates

---

## [1.9.1] - 2026-05-06

### Changed
- Updated root README.md to include execution flow diagrams from docs/diagrams/1.0.4
- Enhanced documentation in examples/README.md and tests/README.md
- Improved test coverage descriptions in README files

### Notes
- This release focuses on documentation improvements and better user guidance

---

## [1.9.0] - 2026-05-06

### Added
- Core upgrade to v1.0.4 with performance and feature enhancements:
  - Route caching (O(1) lookup after first match)
  - Optional trie-based matcher for large route sets
  - Global notFound handler for unmatched routes
  - Improved navigation guard handling
  - Pre-navigation validation before history mutation

### Changed
- Updated core import to use v1.0.4
- Enhanced all examples with further UI improvements and consistency

### Notes
- This release focuses on performance optimizations and enhanced routing capabilities

---

## [1.8.0] - 2026-05-03

### Added
- Core upgrade to v1.0.3 with enhanced routing capabilities:
  - Global `notFound` handler for unmatched routes
  - Improved navigation guards and rollback handling
  - Enhanced route caching and trie-based matching
- Updated testing engine (`tests/engine.mjs`) to support v1.0.3 features
- Enhanced all examples with improved mobile-responsive design and consistent styling

### Changed
- Updated core router to v1.0.3 across all examples
- Improved example layouts with better mobile experience
- Enhanced testing infrastructure to cover new router features

### Notes
- This release focuses on robustness and user experience improvements

---

## [1.7.0] - 2026-05-02

### Added
- Core upgrade to v1.0.2 with performance optimizations:
  - Route cache (memoization) for faster route matching
  - Precompiled dynamic routes for better performance
  - Optional trie matcher for complex routing scenarios
- Added HTML hybrid navigation example:
  - `examples/13-html-hybrid-navigation`
- Added route matcher performance example:
  - `examples/14-route-performance`

### Changed
- Updated example index to include the new demos
- Enhanced testing infrastructure with dedicated testing engine (`tests/engine.mjs`)
- Updated README to document new performance features and examples

### Notes
- This release focuses on performance improvements and advanced navigation patterns

---

## [1.6.0] - 2026-04-29

### Added
- Added comprehensive unit tests for router core in `tests/` folder
- Added modular ESM version of router core (`src/router-core.mjs`) for isolated testing
- Implemented tests for route matching, path normalization, base path handling, middleware pipeline, and navigation logic

### Changed
- Refactored tests to use ESM imports and Node.js built-in assert
- Updated test runner to support ESM modules

### Notes
- This release establishes testing infrastructure to ensure router core reliability without DOM dependencies

---

## [1.5.0] - 2026-04-29

### Added
- Added lazy loading example:
  - `examples/11-lazy-loading`
- Added HTML fetch navigation example:
  - `examples/12-html-fetch-navigation`

### Changed
- Updated example index to include the new demos
- Updated examples README with detailed explanations for all 12 examples
- Updated main README to document the new examples

### Notes
- This release adds advanced routing patterns including lazy loading and dynamic content fetching, completing the example suite

---

## [1.4.0] - 2026-04-29

### Added
- Added middleware support to the core router:
  - `history.use()` for registering middleware functions
  - Middleware pipeline executed before route handling
- Added multi-step flow example:
  - `examples/09-multi-step-flow`
- Added middleware example:
  - `examples/10-middleware`

### Changed
- Updated all example UIs to mobile-friendly design with consistent app containers, headers, and navigation
- Updated example index to include the new demos
- Updated README to document middleware API and new examples

### Notes
- This release introduces middleware pipeline for request processing and significantly enhances example UIs for better demonstration and user experience

---

## [1.3.0] - 2026-04-29

### Added
- Added hash vs history mode comparison example:
  - `examples/05-hash-vs-history`
- Added modal route example:
  - `examples/07-modal-route`
- Renamed bottom sheet example to:
  - `examples/08-bottom-sheet`

### Changed
- Updated example index to include the new demos
- Updated README to document the new examples

### Notes
- This release adds examples demonstrating routing modes comparison and modal-based navigation flows

---

## [1.2.0] - 2026-04-28

### Added
- Added `end` route support in the core router for terminal-route navigation behavior
- Added end-route example:
  - `examples/06-end-route`

### Changed
- Updated example index to include the end-route demo
- Updated root and examples README files to document terminal-route behavior and the new example

### Notes
- This release expands support for mobile-like navigation flows where a route can act as the exit boundary of the current history-driven experience

---

## [1.1.0] - 2026-04-28

### Added
- Implemented full direction-aware lifecycle hooks:
  - `onArrive`
  - `onMeet`
  - `onReturn`
  - `onExit`
  - `onComeback`
- Added smart example server fallback that resolves the nearest `index.html` for nested example routes
- Added dynamic params example:
  - `examples/02-dynamic-params`
- Added lifecycle visualizer example:
  - `examples/03-lifecycle-visualizer`
- Added guards and blocking example:
  - `examples/04-guards-blocking`

### Changed
- Refined router execution flow to distinguish `push`/`replace` from `pop` navigation
- Expanded route registration to support the full lifecycle model in the core router
- Updated example index to expose the new demos
- Refreshed the root and examples README files to match the current implementation and lifecycle behavior

### Fixed
- Improved deep-link handling for history-mode examples served from nested paths
- Cleaned up routing documentation so API behavior matches the current codebase

### Notes
- This release shifts the project from basic route orchestration toward a more complete lifecycle-driven navigation model
- Guard behavior is now demonstrated with a dedicated example for unsaved-form navigation blocking

---

## [1.0.2] - 2026-04-22

### Added
- Introduced base path configuration for nested environments
- Added hash mode support for non-server environments
- Implemented unified path handling layer (base + query + hash)
- Added initial examples:
  - Basic routing
  - Bottom sheet (state-driven)

### Changed
- Refactored navigation to use centralized path normalization
- Improved URL consistency across push/replace/pop
- Updated README to clarify routing modes and server behavior
- Updated examples to use `history.config({ base })`

### Fixed
- Fixed incorrect path duplication when using nested base paths
- Fixed navigation issues on refresh with subdirectory examples

### Notes
- This release focuses on stabilizing core routing behavior and project structure
- Some examples are placeholders and will be expanded in future versions

---

## [1.0.0] - 2026-04-22

### Added
- Initial project setup
- Repository structure and documentation
- High-level API design for History API extension
- Routing concept using Trie (including dynamic routes)
- Lifecycle design:
  - onMeet
  - onArrive
  - onExit
  - onComeback
- Guard system concept:
  - canLeave (route-level)
  - global blockers
- Middleware pipeline design
- Navigation methods definition:
  - navigatePush
  - navigateReplace
  - navigatePop
- Routing modes concept:
  - history mode
  - hash mode
- Context object (ctx) structure
- Execution flow diagrams (activity & sequence)
- Initial examples planning

### Notes
- This version represents the initial design and architecture proposal.
- Implementation is not fully completed and may evolve in future releases.
