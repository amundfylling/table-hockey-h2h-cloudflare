// Guide (guide.html): header wiring, and linking each numbered marker on a screenshot with its
// note underneath, so pointing at one lights up the other.
import { initChrome } from "./chrome.js";

initChrome();

for (const figure of document.querySelectorAll(".g-figure")) {
  const notes = figure.nextElementSibling?.matches(".g-notes") ? figure.nextElementSibling : null;
  if (!notes) continue;
  const pins = [...figure.querySelectorAll(".g-pin")];
  const items = [...notes.querySelectorAll("li[data-pin]")];
  const light = (n) => {
    for (const pin of pins) pin.classList.toggle("is-lit", pin.dataset.pin === n);
    for (const item of items) item.classList.toggle("is-lit", item.dataset.pin === n);
  };
  for (const node of [...pins, ...items]) {
    node.addEventListener("pointerenter", () => light(node.dataset.pin));
    node.addEventListener("pointerleave", () => light(null));
  }
}
