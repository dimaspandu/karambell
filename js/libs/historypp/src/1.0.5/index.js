import { createRouter } from "./core/create-router.js";

// For Node.js tests
export const createEngine = () => createRouter();

// Browser globals
if (typeof window !== "undefined") {
  const router = createRouter();

  window.historypp = router;

  // backward compatibility
  window.history.config = router.config.bind(router);
  window.history.router = router.router.bind(router);
  window.history.use = router.use.bind(router);
  window.history.notFound = router.notFound.bind(router);
  window.history.navigatePush = router.navigatePush.bind(router);
  window.history.navigateReplace = router.navigateReplace.bind(router);
  window.history.navigatePop = router.navigatePop.bind(router);
}