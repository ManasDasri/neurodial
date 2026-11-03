"use strict";
/* Shared, accessible theme controller for the results dashboard and research notebook.
   Set the theme before CSS paints to avoid the wrong-theme flash. */
(function () {
  const root = document.documentElement;
  const key = "theme";
  const media = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let explicitChoice = false;

  function storedTheme() {
    try {
      const value = window.localStorage.getItem(key);
      return value === "light" || value === "dark" ? value : null;
    } catch (_) { return null; }
  }

  const saved = storedTheme();
  explicitChoice = saved !== null;

  function setTheme(value, persist) {
    const next = value === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    if (persist) {
      explicitChoice = true;
      try { window.localStorage.setItem(key, next); } catch (_) { /* optional */ }
    }
    const tag = document.querySelector('meta[name="theme-color"]');
    if (tag) tag.setAttribute("content", next === "dark" ? "#111a1a" : "#f7f8f5");
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const goingDark = next === "light";
      button.setAttribute("aria-label", "Switch to " + (goingDark ? "dark" : "light") + " theme");
      button.setAttribute("title", "Switch to " + (goingDark ? "dark" : "light") + " theme");
      button.setAttribute("aria-pressed", String(next === "dark"));
      const icon = button.querySelector("[data-theme-icon]");
      const label = button.querySelector("[data-theme-label]");
      if (icon) icon.textContent = goingDark ? "☾" : "☀";
      if (label) label.textContent = goingDark ? "Dark" : "Light";
    });
  }

  setTheme(saved || (media && media.matches ? "dark" : "light"), false);

  function wire() {
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const current = root.getAttribute("data-theme");
        setTheme(current === "dark" ? "light" : "dark", true);
      });
    });
    // Re-apply labels when controls first enter the DOM.
    setTheme(root.getAttribute("data-theme"), false);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else { wire(); }

  if (media) {
    const handle = event => {
      if (!explicitChoice) setTheme(event.matches ? "dark" : "light", false);
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", handle);
    else if (typeof media.addListener === "function") media.addListener(handle);
  }
})();
