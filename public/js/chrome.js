// Header behaviour for the standalone pages (tournament, ratings): theme and phone menu.
import { setTheme, toggleTheme } from "./theme.js";
import { safeStorageGet, STORAGE_KEYS } from "./state.js";

export function initChrome() {
  const saved = safeStorageGet(STORAGE_KEYS.theme, null);
  const preferred = saved === "dark" || saved === "light"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(preferred, { persist: saved === "dark" || saved === "light" });
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

  const menuButton = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  menuButton?.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
}
