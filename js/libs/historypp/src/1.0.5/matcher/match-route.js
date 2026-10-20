import { matchSimple } from "./simple-matcher.js";
import { matchTrie } from "./trie-matcher.js";

export function matchRoute(path, state) {
  return state.config.matcher === "trie"
    ? matchTrie(path, state.trieRoot)
    : matchSimple(path, state.routes, state.routeCache);
}