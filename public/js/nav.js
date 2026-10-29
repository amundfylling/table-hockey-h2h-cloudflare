// Top bar: main links, the header search that opens the player finder, the
// phone menu, and the "/" shortcut.
import { elements, isSinglePlayerMode } from "./state.js";
import { requestView } from "./dom.js";

const finder = () => document.getElementById("finder");
const searchButtons = () => [
  document.getElementById("header-search"),
  document.getElementById("mobile-search"),
].filter(Boolean);

// Home sections the main links can jump to, in page order.
const HOME_SECTIONS = ["rivalries", "players"];

function isHome() {
  return document.body.dataset.home === "true";
}

export function isHomeSection(name) {
  return HOME_SECTIONS.includes(name);
}

// The home section named in the URL hash, if any.
export function homeSectionFromHash() {
  const name = window.location.hash.slice(1);
  return isHomeSection(name) ? name : null;
}

// Scrolls the home screen to a section, or to the top when name is empty, and
// keeps the URL hash in step so the link can be shared and the nav marks it.
export function showHomeSection(name) {
  const target = isHomeSection(name) ? document.getElementById(name) : null;
  const shown = target && !target.hidden ? target : null;
  const url = new URL(window.location.href);
  url.hash = shown ? name : "";
  window.history.replaceState(window.history.state, "", url);
  updateNav();
  if (shown) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    shown.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    return true;
  }
  window.scrollTo({ top: 0 });
  return false;
}

export function setFinderOpen(open, focusTarget = elements.playerA) {
  const isOpen = open && !isHome();
  document.body.classList.toggle("finder-open", isOpen);
  searchButtons().forEach((button) => button.setAttribute("aria-expanded", isOpen ? "true" : "false"));
  if (open && focusTarget) {
    requestAnimationFrame(() => {
      if (!isHome()) finder()?.scrollIntoView({ block: "nearest" });
      focusTarget.focus();
      if (typeof focusTarget.select === "function" && focusTarget.value) focusTarget.select();
    });
  }
}

function setMenuOpen(open) {
  const menu = document.getElementById("mobile-menu");
  const toggle = document.getElementById("menu-toggle");
  if (!menu || !toggle) return;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

// Marks the link for the current view.
export function updateNav() {
  const current = isHome()
    ? homeSectionFromHash() || "home"
    : isSinglePlayerMode() ? "players" : "home";
  document.querySelectorAll(".nav a, .mobile-menu a").forEach((link) => {
    if (link.dataset.nav === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

export function initNav() {
  searchButtons().forEach((button) => {
    button.addEventListener("click", () => {
      const open = !document.body.classList.contains("finder-open");
      setFinderOpen(open);
      setMenuOpen(false);
    });
  });
  document.getElementById("finder-close")?.addEventListener("click", () => setFinderOpen(false, null));
  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    const menu = document.getElementById("mobile-menu");
    setMenuOpen(Boolean(menu?.hidden));
  });

  // Links and breadcrumbs with data-nav are handled here so the app keeps its state.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-nav]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setMenuOpen(false);
    requestView({ action: link.dataset.nav });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.body.classList.contains("finder-open")) setFinderOpen(false, null);
      setMenuOpen(false);
      return;
    }
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target.closest?.("input, select, textarea, [contenteditable='true']")) return;
    event.preventDefault();
    setFinderOpen(true);
  });
}
