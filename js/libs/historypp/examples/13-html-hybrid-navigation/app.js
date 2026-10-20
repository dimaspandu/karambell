/**
 * Initialize Hybrid App
 *
 * This file is shared across:
 * - index.html
 * - about.html
 * - contact.html
 *
 * It enables:
 * - SPA navigation
 * - Server-side initial render (hydration)
 */

export default function initApp(initialPath) {
  const view = document.getElementById("view");

  const BASE = "/examples/13-html-hybrid-navigation";

  history.config({
    base: BASE,
    mode: "history"
  });

  // ==============================
  // HYDRATION FLAG
  // ==============================

  // True only on first load (when server already rendered HTML)
  let isHydrating = view && view.children.length > 0;

  // ==============================
  // LINK INTERCEPTION
  // ==============================

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-link]");
    if (!link) return;

    const url = new URL(link.href);

    // Ignore external links
    if (url.origin !== location.origin) return;

    e.preventDefault();
    history.navigatePush(url.pathname);
  });

  // ==============================
  // HELPERS
  // ==============================

  function setActive(path) {
    document.querySelectorAll("nav a").forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === path);
    });
  }

  function renderLoading() {
    view.innerHTML = `<p class="loading">Loading...</p>`;
  }

  function renderError(message = "Failed to load content") {
    view.innerHTML = `<p class="error">${message}</p>`;
  }

  function resolveView(path) {
    return path === "/"
      ? `${BASE}/views/home.html`
      : `${BASE}/views${path}.html`;
  }

  function syncTitleFromDOM() {
    const root = view.firstElementChild;
    const title = root?.dataset?.title;

    if (title) {
      document.title = title;
    }
  }

  async function loadHTML(path) {
    renderLoading();

    try {
      const res = await fetch(resolveView(path));

      if (!res.ok) {
        renderError();
        return;
      }

      const html = await res.text();

      const temp = document.createElement("div");
      temp.innerHTML = html;

      const root = temp.firstElementChild;

      // Update title from fragment
      const title = root?.dataset?.title;
      if (title) {
        document.title = title;
      }

      view.innerHTML = html;

    } catch (err) {
      console.error(err);
      renderError("Network error");
    }
  }

  // ==============================
  // ROUTES
  // ==============================

  history.router("/", {
    async onMeet() {
      setActive("/");

      // Skip fetch if hydrating
      if (isHydrating) {
        syncTitleFromDOM();
        return;
      }

      await loadHTML("/");
    }
  });

  history.router("/about", {
    async onMeet() {
      setActive("/about");

      if (isHydrating) {
        syncTitleFromDOM();
        return;
      }

      await loadHTML("/about");
    }
  });

  history.router("/contact", {
    async onMeet() {
      setActive("/contact");

      if (isHydrating) {
        syncTitleFromDOM();
        return;
      }

      await loadHTML("/contact");
    }
  });

  // ==============================
  // INITIAL SYNC
  // ==============================

  history.navigateReplace(initialPath || location.pathname);

  // Hydration only applies once
  isHydrating = false;
}