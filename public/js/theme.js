import { elements, safeStorageSet, STORAGE_KEYS } from "./state.js";
import { SVG_SUN, SVG_MOON } from "./constants.js";

export function setTheme(mode) {
  if (mode === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
  if (elements.themeToggle) {
    const isDark = mode === "dark";
    elements.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    elements.themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    const label = elements.themeToggle.querySelector("span");
    if (label) label.textContent = isDark ? "Light mode" : "Dark mode";
    const svgEl = elements.themeToggle.querySelector("svg");
    if (svgEl) {
      svgEl.innerHTML = isDark ? SVG_SUN : SVG_MOON;
    }
  }
  safeStorageSet(STORAGE_KEYS.theme, mode);
}

export function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
}

export function initInfoPopovers() {
  const wraps = Array.from(document.querySelectorAll(".info-wrap"));
  if (!wraps.length) return;

  const closeAll = () => {
    wraps.forEach((wrap) => {
      wrap.classList.remove("is-open");
      const btn = wrap.querySelector(".info-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  };

  wraps.forEach((wrap) => {
    const btn = wrap.querySelector(".info-btn");
    if (!btn) return;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = wrap.classList.contains("is-open");
      closeAll();
      if (!wasOpen) {
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".info-wrap")) {
      closeAll();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAll();
    }
  });
}
