# Contributing to History++

Thank you for your interest in contributing to History++.

This project focuses on building a lightweight, framework-agnostic navigation engine on top of the native History API. Contributions are welcome for:

* Core routing features
* Performance improvements
* Browser behavior fixes
* Middleware/lifecycle enhancements
* Tests
* Documentation
* Examples
* Developer tooling

---

# Project Philosophy

History++ aims to stay:

* Lightweight
* Dependency-free
* UI-framework agnostic
* Predictable
* Easy to reason about
* Browser-native

Please keep these principles in mind when contributing.

---

# Development Setup

## Requirements

* Node.js 18+
* Modern browser
* ESM-compatible environment

---

## Install

```bash
npm install
```

---

## Run Local Server

```bash
node server.js
```

Open:

```text
http://localhost:5173
```

---

# Project Structure

```text
src/
  1.0.5/
    core/
    matcher/
    middleware/
    navigation/
    browser/
    utils/

examples/
tests/
docs/
```

---

# Core Architecture

The router is modularized into several layers.

## Core

Responsible for:

* state
* router creation
* configuration

Files:

* `core/create-router.mjs`
* `core/state.mjs`

---

## Matcher

Responsible for:

* static matching
* dynamic params
* trie matching

Files:

* `matcher/simple-matcher.mjs`
* `matcher/trie-matcher.mjs`

---

## Navigation

Responsible for:

* push/replace/pop handling
* lifecycle orchestration
* guards
* rollback handling

Files:

* `navigation/run.mjs`
* `navigation/navigation.mjs`
* `navigation/guards.mjs`

---

## Middleware

Responsible for:

* middleware execution pipeline

Files:

* `middleware/run-middlewares.mjs`

---

## Browser

Responsible for:

* popstate
* hashchange
* browser integration

Files:

* `browser/events.mjs`

---

# Coding Style

## General

* Use ESM modules
* Prefer pure functions when possible
* Keep modules focused and isolated
* Avoid unnecessary abstractions
* Avoid external dependencies unless truly necessary

---

## Formatting

* 2-space indentation
* Semicolons required
* Use descriptive variable names
* Keep comments concise and technical

---

## Comments

Use English only.

Good:

```js
// Restore removed history entry after blocked popstate navigation.
```

Avoid:

```js
// balik lagi biar aman
```

---

# Testing

## Run All Tests

```bash
node tests/index.js
```

---

## Test Philosophy

Tests should focus on:

* isolated behavior
* deterministic output
* minimal side effects

Prefer unit tests over large integration tests when possible.

---

## Recommended Coverage

### Matcher

* static routes
* dynamic params
* cache behavior
* trie matching

### Navigation

* push/replace/pop
* rollback behavior
* end route logic

### Guards

* blocked navigation
* popstate rollback

### Middleware

* execution order
* async behavior

---

# Examples

Examples are intentionally simple and educational.

When adding examples:

* Keep UI minimal
* Prefer mobile-friendly layouts
* Demonstrate one concept clearly
* Avoid framework dependencies

---

# Pull Requests

## Before Opening a PR

Please ensure:

* tests pass
* examples still work
* no breaking changes unless intentional
* documentation is updated

---

## PR Recommendations

A good PR should include:

* clear title
* concise description
* rationale for the change
* affected modules/examples
* screenshots or recordings if UI behavior changes

---

# Versioning

History++ currently evolves through:

* engine versions (`src/1.0.x`)
* project releases (`CHANGELOG.md`)

Please avoid removing older engine versions unless explicitly discussed.

---

# Areas Open for Contribution

Potential future improvements:

* nested routes
* route groups
* transition hooks
* async middleware
* scroll restoration
* SSR adapters
* React/Vue/Solid integrations
* devtools/debugger
* route prefetching
* memory history mode

---

# Reporting Bugs

When reporting bugs, include:

* browser
* reproduction steps
* expected behavior
* actual behavior
* minimal reproducible example

---

# License

By contributing to this project, you agree that your contributions will be licensed under the project's MIT License.
