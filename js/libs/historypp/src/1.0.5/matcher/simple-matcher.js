import { normalizePath } from "../utils/path.js";

export function matchSimple(path, routes, routeCache) {
  path = normalizePath(path);

  if (routeCache[path]) {
    return routeCache[path];
  }

  for (const r of routes) {

    if (!r.isDynamic && r.path === path) {
      return (routeCache[path] = {
        route: r,
        params: {}
      });
    }

    if (r.isDynamic) {
      const match = path.match(r.regex);

      if (match) {
        const params = {};

        r.keys.forEach((k, i) => {
          params[k] = match[i + 1];
        });

        return (routeCache[path] = {
          route: r,
          params
        });
      }
    }
  }

  return null;
}