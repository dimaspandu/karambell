export function compileRoute(path, handler = {}) {
  const isDynamic = path.includes(":");

  let keys = [];
  let regex = null;

  if (isDynamic) {
    const pattern = path.replace(/:([^/]+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    });

    regex = new RegExp("^" + pattern + "$");
  }

  return {
    path,
    isDynamic,
    keys,
    regex,
    ...handler
  };
}