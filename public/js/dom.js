// Tiny element builder so views can be written without innerHTML for user data.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : value);
  });
  children.flat().forEach((child) => {
    if (child == null || child === false) return;
    node.append(child instanceof Node ? child : String(child));
  });
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Inline icon from a few path strings (24px viewBox, stroked).
export function icon(paths, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  [].concat(paths).forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
  return svg;
}

export const ICONS = {
  right: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  swap: ["M7 4L3 8l4 4", "M3 8h14", "M17 20l4-4-4-4", "M21 16H7"],
};

// Asks main.js to open a view without importing it (avoids an import cycle).
export function requestView(detail) {
  document.dispatchEvent(new CustomEvent("h2h:open", { detail }));
}
