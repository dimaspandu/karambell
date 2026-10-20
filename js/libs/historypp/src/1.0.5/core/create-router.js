import { createState } from "./state.js";

import { normalizePath } from "../utils/path.js";

import { compileRoute } from "../matcher/compile-route.js";
import { addToTrie } from "../matcher/trie-matcher.js";
import { matchRoute as matchRouteFn } from "../matcher/match-route.js";

import {
  navigatePush,
  navigateReplace,
  navigatePop
} from "../navigation/navigation.js";

import { bindBrowserEvents } from "../browser/events.js";

export function createRouter() {

  const state = createState();

  if (typeof window !== "undefined") {
    bindBrowserEvents(state);
  }

  return {

    config(options = {}) {
      state.config.base = options.base || "";
      state.config.mode = options.mode || "history";
      state.config.matcher = options.matcher || "simple";
    },

    use(fn) {
      state.middlewares.push(fn);
    },

    notFound(handler) {
      state.notFoundHandler = handler;
    },

    router(path, handler = {}) {

      if (typeof handler === "function") {
        handler = {
          onMeet: handler
        };
      }

      const compiled = compileRoute(
        normalizePath(path),
        handler
      );

      state.routes.push({
        ...compiled,
        onMeet: handler?.onMeet || (() => {}),
        onArrive: handler?.onArrive || null,
        onExit: handler?.onExit || null,
        onReturn: handler?.onReturn || null,
        onComeback: handler?.onComeback || null,
        canLeave: handler?.canLeave || null,
        end: handler?.end ?? false
      });

      if (state.config.matcher === "trie") {
        addToTrie(compiled, state.trieRoot);
      }

      state.routeCache = Object.create(null);

      return this;
    },

    navigatePush(path, data) {
      navigatePush(state, path, data);
    },

    navigateReplace(path, data) {
      navigateReplace(state, path, data);
    },

    navigatePop() {
      navigatePop();
    },

    navigate(path, data) {
      const cleanPath = normalizePath(path);

      const ctx = {
        path: cleanPath,
        from: state.current?.path || null,
        to: cleanPath,
        type: "push",
        query: {}
      };

      navigatePush(state, path, data);

      return ctx;
    },

    matchRoute(path) {
      return matchRouteFn(path, state);
    },

    _state: state
  };
}