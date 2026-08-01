import {
  elements,
  safeStorageGet,
  safeStorageSet,
  STORAGE_KEYS,
} from "./state.js";
import { SVG_SUN, SVG_MOON } from "./constants.js";

const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const initialStoredTheme = safeStorageGet(STORAGE_KEYS.theme, null);
let hasExplicitTheme = initialStoredTheme === "dark" || initialStoredTheme === "light";

export function setTheme(mode, options = {}) {
  const resolvedMode = mode === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", resolvedMode);
  document.documentElement.style.colorScheme = resolvedMode;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = resolvedMode === "dark" ? "#0f1215" : "#f6f2ec";
  if (elements.themeToggle) {
    const isDark = resolvedMode === "dark";
    const actionLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
    elements.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    elements.themeToggle.setAttribute("aria-label", actionLabel);
    elements.themeToggle.title = actionLabel;
    const label = elements.themeToggle.querySelector("span");
    if (label) label.textContent = isDark ? "Light mode" : "Dark mode";
    const svgEl = elements.themeToggle.querySelector("svg");
    if (svgEl) {
      svgEl.innerHTML = isDark ? SVG_SUN : SVG_MOON;
    }
  }
  if (options.persist !== false) {
    hasExplicitTheme = true;
    safeStorageSet(STORAGE_KEYS.theme, resolvedMode);
  }
}

export function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
}

export function initInfoPopovers() {
  const wraps = Array.from(document.querySelectorAll(".info-wrap"));
  if (!wraps.length) return;

  const positionTooltip = (wrap) => {
    const tooltip = wrap.querySelector(".info-tooltip");
    if (!tooltip) return;
    tooltip.style.setProperty("--tooltip-shift-x", "0px");
    const rect = tooltip.getBoundingClientRect();
    const viewportPadding = 12;
    let shift = 0;
    if (rect.right > window.innerWidth - viewportPadding) {
      shift -= rect.right - (window.innerWidth - viewportPadding);
    }
    if (rect.left + shift < viewportPadding) {
      shift += viewportPadding - (rect.left + shift);
    }
    tooltip.style.setProperty("--tooltip-shift-x", `${Math.round(shift)}px`);
  };

  const closeAll = (dismiss = false) => {
    wraps.forEach((wrap) => {
      wrap.classList.remove("is-open");
      wrap.classList.toggle("is-dismissed", dismiss);
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
        wrap.classList.remove("is-dismissed");
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => positionTooltip(wrap));
      } else {
        wrap.classList.add("is-dismissed");
      }
    });
    wrap.addEventListener("pointerenter", () => {
      wrap.classList.remove("is-dismissed");
      requestAnimationFrame(() => positionTooltip(wrap));
    });
    wrap.addEventListener("pointerleave", () => {
      if (!wrap.contains(document.activeElement)) {
        wrap.classList.remove("is-dismissed");
      }
    });
    wrap.addEventListener("focusin", () => {
      wrap.classList.remove("is-dismissed");
      btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => positionTooltip(wrap));
    });
    wrap.addEventListener("focusout", (event) => {
      if (wrap.contains(event.relatedTarget)) return;
      wrap.classList.remove("is-open", "is-dismissed");
      btn.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".info-wrap")) {
      closeAll(true);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAll(true);
    }
  });

  window.addEventListener("resize", () => {
    const openWrap = wraps.find((wrap) => wrap.classList.contains("is-open"));
    if (openWrap) positionTooltip(openWrap);
  });
}

setTheme(
  hasExplicitTheme ? initialStoredTheme : (colorSchemeQuery.matches ? "dark" : "light"),
  { persist: false }
);

colorSchemeQuery.addEventListener("change", (event) => {
  if (!hasExplicitTheme) {
    setTheme(event.matches ? "dark" : "light", { persist: false });
  }
});
