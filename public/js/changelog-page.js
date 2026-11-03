// Changelog (changelog.html): header wiring plus the New / Improved / Fixed filter.
import { initChrome } from "./chrome.js";

initChrome();

const LABELS = { all: "changes", new: "new features", improved: "improvements", fixed: "fixes" };
const buttons = [...document.querySelectorAll(".change-filter button")];
const changes = [...document.querySelectorAll(".change")];
const releases = [...document.querySelectorAll(".release")];
const status = document.getElementById("change-filter-status");

function count(type) {
  return type === "all" ? changes.length : changes.filter((li) => li.dataset.type === type).length;
}

for (const button of buttons) {
  const n = document.createElement("span");
  n.className = "count";
  n.textContent = count(button.dataset.filter);
  button.append(n);
  button.addEventListener("click", () => show(button.dataset.filter));
}

function show(type) {
  for (const button of buttons) {
    button.setAttribute("aria-pressed", button.dataset.filter === type ? "true" : "false");
  }
  for (const li of changes) li.hidden = type !== "all" && li.dataset.type !== type;
  for (const release of releases) {
    release.hidden = !release.querySelector(".change:not([hidden])");
  }
  status.textContent = `Showing ${count(type)} ${LABELS[type]}`;
}
