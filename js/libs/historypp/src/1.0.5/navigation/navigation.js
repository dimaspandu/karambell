import { normalizePath, buildURL } from "../utils/path.js";
import { canNavigate } from "./guards.js";
import { run } from "./run.js";

export function navigatePush(state, path, data = {}) {

  const cleanPath = normalizePath(path);

  const ctx = {
    path: cleanPath,
    from: state.current?.path || null,
    to: cleanPath,
    type: "push",
    query: {}
  };

  if (!canNavigate(state.current, ctx)) {
    return;
  }

  const url = buildURL(cleanPath, state.config);

  if (typeof window === "undefined") {
    // Node.js: just run without URL changes
    run(state, cleanPath, "push");
    return;
  }

  if (state.config.mode === "hash") {

    const clean = url.replace("/#", "");

    location.hash = clean;

    run(state, clean, "push");

    return;
  }

  history.pushState(data, "", url);

  run(state, url, "push");
}

export function navigateReplace(state, path, data = {}) {

  const cleanPath = normalizePath(path);

  const ctx = {
    path: cleanPath,
    from: state.current?.path || null,
    to: cleanPath,
    type: "replace",
    query: {}
  };

  if (!canNavigate(state.current, ctx)) {
    return;
  }

  const url = buildURL(cleanPath, state.config);

  if (typeof window === "undefined") {
    // Node.js: just run without URL changes
    run(state, cleanPath, "replace");
    return;
  }

  if (state.config.mode === "hash") {

    const clean = url.replace("/#", "");

    location.replace("#" + clean);

    run(state, clean, "replace");

    return;
  }

  history.replaceState(data, "", url);

  run(state, url, "replace");
}

export function navigatePop() {
  if (typeof window !== "undefined") {
    history.back();
  }
}