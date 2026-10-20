export function parseQuery(search = "") {
  const query = {};
  const params = new URLSearchParams(search);

  for (const [k, v] of params.entries()) {
    query[k] = v;
  }

  return query;
}