import { normalizePath } from "../utils/path.js";

export function addToTrie(route, trieRoot) {
  const parts = route.path.split("/").filter(Boolean);

  let node = trieRoot;

  for (const part of parts) {
    const key = part.startsWith(":") ? ":" : part;

    node[key] = node[key] || {};
    node = node[key];

    if (key === ":") {
      node.paramKey = part.slice(1);
    }
  }

  node.route = route;
}

export function matchTrie(path, trieRoot) {
  const parts = normalizePath(path).split("/").filter(Boolean);

  let node = trieRoot;
  const params = {};

  for (const part of parts) {

    if (node[part]) {
      node = node[part];
    } else if (node[":"]) {
      params[node[":"].paramKey] = part;
      node = node[":"];
    } else {
      return null;
    }
  }

  if (!node.route) {
    return null;
  }

  return {
    route: node.route,
    params
  };
}