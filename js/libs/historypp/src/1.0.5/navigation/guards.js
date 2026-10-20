export function canNavigate(current, ctx) {
  if (!current || !current.canLeave) {
    return true;
  }

  return current.canLeave(ctx);
}

export function isEndRoute(route, ctx) {
  if (!route) {
    return false;
  }

  if (typeof route.end === "function") {
    return !!route.end(ctx);
  }

  return !!route.end;
}