# Examples

This folder contains runnable demos for `History++`. Each example isolates one navigation scenario so the router behavior is easier to inspect, especially around route matching and lifecycle flow.

## Run the examples

Start the local server from the project root:

```bash
node server.js
```

Then open:

```text
http://localhost:5173/examples/
```

If you open the files directly with `file://`, demos that use `history` mode will not resolve routes correctly.

## What these demos cover

All implemented demos:

* `01-basic-routing` - demonstrates the minimal setup for route registration, link interception, and initial URL synchronization with the router
* `02-dynamic-params` - shows dynamic route matching with parameters like `/user/:id`, including programmatic navigation and param extraction
* `03-lifecycle-visualizer` - provides a visual timeline of the full route lifecycle hooks: `onArrive`, `onMeet`, `onReturn`, `onExit`, and `onComeback` for different navigation types
* `04-guards-blocking` - illustrates route guard behavior with `canLeave` for preventing navigation on unsaved changes, including blocking browser back
* `05-hash-vs-history` - compares the differences between hash mode (`#/path`) and history mode (`/path`) routing, including their server requirements
* `06-end-route` - demonstrates terminal routes with `end: true` for mobile-like navigation where a route acts as the flow boundary, affecting browser back behavior
* `07-modal-route` - shows modal-based navigation where routes control modal dialog state, with proper focus management and overlay handling
* `08-bottom-sheet` - demonstrates route-driven bottom-sheet UI state management, where navigation controls the sheet's visibility and interaction
* `09-multi-step-flow` - illustrates multi-step navigation flows with step validation and progress tracking, using routes to manage flow state
* `10-middleware` - demonstrates middleware usage for request processing, logging, and cross-cutting concerns like authentication or analytics
* `11-lazy-loading` - shows lazy loading of route handlers or components on demand, improving initial load performance
* `12-html-fetch-navigation` - demonstrates dynamic HTML content fetching and navigation, simulating single-page app behavior with server-rendered content
* `13-html-hybrid-navigation` - combines traditional HTML fragment loading with modern SPA routing for hybrid applications
* `14-route-performance` - benchmarks route matching performance, comparing different matching algorithms and caching strategies

## Common pattern used in the demos

Most demos follow the same setup:

```js
history.config({
  base: "/examples/example-name",
  mode: "history"
});

history.router("/", {
  onMeet() {}
});

history.navigateReplace(location.pathname + location.search);
```

Why this matters:

* `base` lets each demo run from its own subdirectory
* `history` mode keeps the examples aligned with the main project behavior
* `navigateReplace(location.pathname + location.search)` performs the initial sync from the current browser URL into the router

## End route demo note

`06-end-route` demonstrates route definitions that use `end: true`.

It shows:

* push-based navigation between sibling screens
* a terminal route acting as the root boundary of the demo flow
* browser back behavior when the active route is marked as an end route

## Lifecycle demo note

`03-lifecycle-visualizer` is the best reference when you want to understand the current lifecycle model.

It shows:

* `push` and `replace` entering a route through `onArrive -> onMeet`
* `pop` leaving the current route through `onReturn -> onExit`
* `pop` re-activating the target route through `onComeback -> onMeet`

## Middleware demo note

`10-middleware` shows how middleware functions are executed in a pipeline before route handling.

It demonstrates:

* registering middleware with `history.use()`
* middleware receiving context and `next()` for continuation
* logging and preprocessing requests before they reach route handlers

## Multi-step flow demo note

`09-multi-step-flow` illustrates complex navigation flows with validation and state management.

It shows:

* managing step progression with route-based state
* preventing invalid transitions using guards
* maintaining flow context across navigation

## Lazy loading demo note

`11-lazy-loading` demonstrates on-demand loading of route handlers to improve performance.

It covers:

* registering routes with lazy-loaded handlers
* loading components or modules asynchronously
* handling loading states during navigation

## HTML fetch navigation demo note

`12-html-fetch-navigation` simulates traditional server navigation in a single-page app context.

It demonstrates:

* fetching HTML content from routes
* updating the DOM with fetched content
* maintaining navigation state with dynamic content

## HTML hybrid navigation demo note

`13-html-hybrid-navigation` shows a hybrid approach combining traditional HTML navigation with modern SPA routing.

It demonstrates:

* loading HTML fragments for different routes
* maintaining SPA-like navigation behavior
* transitioning between server-rendered and client-rendered content

## Route performance demo note

`14-route-performance` benchmarks the performance characteristics of different route matching strategies.

It demonstrates:

* comparing simple vs trie-based route matching
* measuring route registration and lookup performance
* visualizing the impact of route caching and precompilation

## Notes

The examples are intentionally framework-agnostic. They use plain HTML and direct DOM updates so the router behavior stays easy to observe.

All examples now feature improved mobile-responsive design with consistent styling and better user experience across devices.

For the full API and design overview, see the root [README](../README.md).
