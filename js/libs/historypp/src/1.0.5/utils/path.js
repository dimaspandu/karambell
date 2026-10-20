export function normalizePath(path) {
  if (!path) {
    return "/";
  }

  if (path.startsWith("#")) {
    path = path.slice(1);
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  return path;
}

export function stripBase(path, base) {
  if (base && path.startsWith(base)) {
    const p = path.slice(base.length);
    return p || "/";
  }

  return path;
}

export function addBase(path, base) {
  if (!base) {
    return path;
  }

  if (path.startsWith(base)) {
    return path;
  }

  return base + path;
}

export function buildURL(path, config) {
  path = normalizePath(path);

  if (config.mode === "hash") {
    return "/#" + path;
  }

  return addBase(path, config.base);
}