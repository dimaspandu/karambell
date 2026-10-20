export function createState() {
  return {
    routes: [],
    middlewares: [],
    current: null,
    notFoundHandler: null,

    config: {
      base: "",
      mode: "history",
      matcher: "simple"
    },

    routeCache: Object.create(null),

    trieRoot: {}
  };
}