// Guide (guide.html): header wiring, linking each numbered marker on a screenshot with its note
// underneath, and on phones a step-by-step tour built from the same markup.
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

buildTour();

// Phone tour. Each section becomes one or more scenes: the screenshot stays put on screen while
// a card per note scrolls over it, one card per screen, and the page snaps from card to card.
// The screenshot pans to the marker the card talks about and dims everything around it. A bar
// at the top shows which of the sections you are in and how far through it. The desktop layout
// is untouched: CSS shows either the tour or the original section content, never both.
function buildTour() {
  const main = document.querySelector("main.guide");
  const sections = [...document.querySelectorAll(".guide-step")];
  if (!main || !sections.length) return;
  document.documentElement.classList.add("has-guide-tour");

  const progress = document.createElement("nav");
  progress.className = "gt-progress";
  progress.setAttribute("aria-label", "Guide progress");
  progress.innerHTML = `<div class="gt-p-row"><span class="gt-p-num" aria-hidden="true"></span>
    <span class="gt-p-title"></span><span class="gt-p-count"></span></div>
    <ol class="gt-p-bar"></ol>`;
  const bar = progress.querySelector(".gt-p-bar");
  sections[0].before(progress);

  const steps = []; // every snap slot, in page order: { slot, section index, scene, pin }
  sections.forEach((section, si) => {
    const num = section.querySelector(".gs-num")?.textContent.trim() ?? String(si + 1);
    const title = section.querySelector(".gs-head h2")?.textContent.trim() ?? "";
    section.dataset.tourNum = num;
    section.dataset.tourTitle = title;
    const seg = document.createElement("li");
    seg.innerHTML = `<a href="#${section.id}"><span class="sr-only">${num} ${title}</span><i></i></a>`;
    bar.append(seg);

    const figures = [...section.querySelectorAll(".g-figure")];
    if (!figures.length) return; // the tips section stays as it is
    const tour = document.createElement("div");
    tour.className = "gt-section";
    figures.forEach((figure, fi) => {
      const notes = figure.nextElementSibling?.matches(".g-notes") ? figure.nextElementSibling : null;
      // "Further down the same page" boxes follow the notes of the figure they belong to.
      let more = notes?.nextElementSibling?.matches(".g-more") ? notes.nextElementSibling : null;
      if (!more && fi === figures.length - 1) more = section.querySelector(":scope > .g-more");
      const scene = buildScene(section, figure, notes, more, fi === 0);
      tour.append(scene.el);
      for (const s of scene.slots) steps.push({ ...s, si, scene });
    });
    section.append(tour);
    section.classList.add("gt-toured");
  });

  const segs = [...bar.children];
  const row = {
    num: progress.querySelector(".gt-p-num"),
    title: progress.querySelector(".gt-p-title"),
    count: progress.querySelector(".gt-p-count"),
  };
  let current = null;

  const activate = (step) => {
    if (step === current) return;
    current = step;
    step.scene.show(step);
    const inSection = steps.filter((s) => s.si === step.si);
    const k = inSection.indexOf(step);
    const section = sections[step.si];
    row.num.textContent = section.dataset.tourNum;
    row.title.textContent = section.dataset.tourTitle;
    row.count.textContent = `${k + 1}/${inSection.length}`;
    segs.forEach((seg, i) => {
      seg.style.setProperty("--fill", i < step.si ? 1 : i > step.si ? 0 : (k + 1) / inSection.length);
      seg.classList.toggle("is-current", i === step.si);
    });
  };

  // Tips has no slots of its own: once it is reached the bar shows it as the last, full section.
  const showSection = (si) => {
    current = null;
    const section = sections[si];
    row.num.textContent = section.dataset.tourNum;
    row.title.textContent = section.dataset.tourTitle;
    row.count.textContent = "";
    segs.forEach((seg, i) => {
      seg.style.setProperty("--fill", i <= si ? 1 : 0);
      seg.classList.toggle("is-current", i === si);
    });
  };

  // The step whose slot crosses the middle of the screen is the one being read. Measured on
  // scroll rather than with an IntersectionObserver, whose percentage rootMargin resolves
  // against the width in some browsers and so misses the midpoint on landscape phones.
  const plain = sections.filter((section) => !section.querySelector(".gt-section"));
  let queued = false;
  const track = () => {
    queued = false;
    if (!progress.offsetParent) return; // desktop layout: the tour is hidden
    const mid = innerHeight / 2;
    const within = (node) => {
      const r = node.getBoundingClientRect();
      return r.top <= mid && r.bottom > mid;
    };
    const step = steps.find((s) => within(s.slot));
    if (step) return activate(step);
    const section = plain.find(within);
    if (section) showSection(sections.indexOf(section));
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(track);
  };
  addEventListener("scroll", schedule, { passive: true });
  if (steps.length) activate(steps[0]);
  schedule();

  // Cards differ in height, so the pan depends on layout: redo it when the screen size changes.
  addEventListener("resize", () => {
    current?.scene.show(current, true);
    schedule();
  });
}

function buildScene(section, figure, notes, more, withIntro) {
  const el = document.createElement("div");
  el.className = "gt-scene";

  const stage = document.createElement("div");
  stage.className = "gt-stage";
  const frame = figure.querySelector(".g-frame").cloneNode(true);
  frame.classList.add("gt-frame");
  const canvas = frame.querySelector(".g-canvas");
  const view = document.createElement("div");
  view.className = "gt-view";
  canvas.before(view);
  view.append(canvas);
  const spot = document.createElement("span");
  spot.className = "gt-spot";
  spot.setAttribute("aria-hidden", "true");
  canvas.append(spot);
  stage.append(frame);
  el.append(stage);

  const pins = [...canvas.querySelectorAll(".g-pin")];
  const slots = [];
  const addSlot = (card, pin) => {
    const slot = document.createElement("div");
    slot.className = "gt-slot";
    slot.append(card);
    el.append(slot);
    slots.push({ slot, pin });
    return slot;
  };

  if (withIntro) {
    const head = section.querySelector(".gs-head");
    const card = document.createElement("div");
    card.className = "gt-card gt-card-intro";
    card.innerHTML = `<span class="gt-kicker" aria-hidden="true">${section.dataset.tourNum}</span>`;
    const h2 = head.querySelector("h2").cloneNode(true);
    h2.removeAttribute("id");
    card.append(h2);
    const p = head.querySelector("p");
    if (p) card.append(p.cloneNode(true));
    const count = notes?.querySelectorAll("li[data-pin]").length ?? 0;
    if (count) {
      const hint = document.createElement("p");
      hint.className = "gt-hint";
      hint.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>Swipe up for ${count} notes`;
      card.append(hint);
    }
    addSlot(card, null);
  }

  for (const li of notes ? notes.querySelectorAll("li[data-pin]") : []) {
    const n = li.dataset.pin;
    const card = document.createElement("div");
    card.className = "gt-card";
    const badge = document.createElement("span");
    badge.className = "gt-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = n;
    const body = document.createElement("div");
    body.className = "gt-text";
    body.append(...[...li.childNodes].map((node) => node.cloneNode(true)));
    card.append(badge, body);
    const pin = pins.find((p) => p.dataset.pin === n && p.style.getPropertyValue("--pd") !== "none");
    const slot = addSlot(card, pin ?? null);
    if (pin) pin.addEventListener("click", () => slot.scrollIntoView({ block: "start" }));
  }

  if (more) {
    const card = document.createElement("div");
    card.className = "gt-card gt-card-more";
    card.append(...[...more.children].map((node) => node.cloneNode(true)));
    addSlot(card, "end");
  }

  el.style.setProperty("--slots", slots.length);

  // Pan so the marker sits in the middle of the part of the screenshot the card leaves free.
  const show = (step) => {
    const pin = step.pin;
    for (const p of pins) {
      p.classList.toggle("is-lit", p === pin);
      p.classList.toggle("is-dim", pin !== null && p !== pin);
    }
    const viewH = view.clientHeight;
    const canvasH = canvas.offsetHeight;
    const cardH = step.slot.querySelector(".gt-card").offsetHeight + 24;
    const free = Math.max(viewH - cardH, viewH * 0.35);
    let y = 0;
    if (pin === "end") y = viewH - canvasH;
    else if (pin) y = free / 2 - (parseFloat(pin.style.getPropertyValue("--py")) / 100) * canvasH;
    y = Math.min(0, Math.max(Math.min(0, viewH - canvasH), y));
    canvas.style.transform = `translateY(${Math.round(y)}px)`;
    el.classList.toggle("is-spot", pin instanceof Element);
    if (pin instanceof Element) {
      spot.style.setProperty("--sx", pin.style.getPropertyValue("--px"));
      spot.style.setProperty("--sy", pin.style.getPropertyValue("--py"));
    }
  };

  // The screenshot's height is only known once it has loaded.
  for (const img of canvas.querySelectorAll("img")) {
    img.addEventListener("load", () => {
      if (el.classList.contains("is-active-scene")) show(el._step);
    });
  }

  return {
    el,
    slots,
    show(step) {
      document.querySelectorAll(".gt-scene.is-active-scene").forEach((s) => {
        if (s !== el) s.classList.remove("is-active-scene");
      });
      el.classList.add("is-active-scene");
      el._step = step;
      show(step);
    },
  };
}
