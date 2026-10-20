export function runMiddlewares(middlewares, ctx, finalHandler) {
  let index = -1;

  function dispatch(i) {
    if (i <= index) {
      return;
    }

    index = i;

    const mw = middlewares[i];

    if (!mw) {
      return finalHandler();
    }

    return mw(ctx, () => dispatch(i + 1));
  }

  return dispatch(0);
}