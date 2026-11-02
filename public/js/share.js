// "Share image": opens a preview dialog straight away, draws the card (share-card.js)
// and then offers the phone's share sheet, copy and download. The image is ready
// before any of those buttons can be pressed, so the share sheet always opens from a
// fresh tap (iOS refuses navigator.share() once a tap is a few seconds old).
import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { computeSummary, forecastFor } from "./summary.js";
import { computeSeriesSummary, formatSeriesScore } from "./series.js";
import { enrichPlayerRecord, getAliasGroup, getWorldRank, updateSelectionControls } from "./players.js";
import { getActiveFilterCount } from "./filters.js";
import { getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { buildVerdict, groupTournaments, lastName, monthYear, opponentRecords } from "./insights.js";
import { storyFindings } from "./story.js";
import { formatDate } from "./utils.js";
import { fetchJson, fetchPlayerPayload } from "./data.js";
import { el, icon } from "./dom.js";
import { CARD_FONTS, CARD_HEIGHT, CARD_WIDTH, drawShareCard } from "./share-card.js";

// Helper to sanitize player name for filename
export function sanitizeName(name, fallback = "player") {
  if (!name) return fallback;
  const sanitized = name
    .normalize("NFKC")
    .replace(/\s+/g, "_")
    .replace(/[^\p{Letter}\p{Mark}\p{Number}_-]/gu, "")
    .replace(/^_+|_+$/g, "");
  return sanitized || fallback;
}

// What to call each player in short: the surname, or the first name when both share it.
export function shortNames(nameA, nameB) {
  const a = lastName(nameA);
  const b = lastName(nameB);
  if (a.toLowerCase() !== b.toLowerCase()) return [a, b];
  const first = (name) => String(name || "").trim().split(/\s+/)[0] || name;
  return [first(nameA), first(nameB)];
}

const fmt = (value) => Number(value || 0).toLocaleString("en-US");
const pct1 = (value) => `${value.toFixed(1)}%`;
const pct0 = (value) => `${Math.round(value * 100)}%`;

// The small label in the card's top-right corner, e.g. "Head-to-head · Playoffs · 2020–2026".
export function shareScope({ single = false, series = false, stageTab = "overall", yearFrom = "all", yearTo = "all", tournament = "", otherFilters = 0 }) {
  const parts = [single ? "Career" : "Head-to-head"];
  if (stageTab === "playoff") parts.push(series ? "Playoff series" : "Playoffs");
  else if (stageTab === "round-robin") parts.push("Round-robin");
  else parts.push("All games");
  if (yearFrom !== "all" || yearTo !== "all") {
    if (yearFrom === yearTo) parts.push(String(yearFrom));
    else parts.push(`${yearFrom === "all" ? "Up" : yearFrom}–${yearTo === "all" ? "now" : yearTo}`.replace("Up–", "To "));
  }
  if (tournament) parts.push(tournament);
  if (otherFilters > 0) parts.push(otherFilters === 1 ? "1 filter" : `${otherFilters} filters`);
  return parts.join(" · ");
}

// Up to `max` story-rail findings for the card, skipping ones the headline already says.
export function pickFindings(story, keys, headline = "", max = 3) {
  return keys
    .map((key) => story?.[key])
    .filter(Boolean)
    .filter((line) => {
      const since = line.split(" since ")[1];
      return !(since && headline.includes(`since ${since}`));
    })
    .slice(0, max)
    .map((line) => ({ text: line }));
}

function ratingOf(playerId) {
  for (const id of getAliasGroup(playerId)) {
    const rating = state.playerFileCache.get(id)?.rating;
    if (rating && Number.isFinite(rating.rating)) return rating;
  }
  return null;
}

function spanOf(ordered) {
  const first = String(ordered[0]?.date || "").slice(0, 4);
  const lastItem = ordered[ordered.length - 1];
  const last = String(lastItem?.end_date || lastItem?.date || "").slice(0, 4);
  if (!first || !last) return "";
  return first === last ? first : `${first}–${last}`;
}

function scopeFromState(single, series) {
  const { filters } = state;
  let tournament = "";
  if (filters.tournament !== "all") {
    const option = document.getElementById("tournament-filter")
      ?.querySelector(`option[value="${CSS.escape(filters.tournament)}"]`);
    tournament = option?.textContent || "";
  }
  const years = filters.yearFrom !== "all" || filters.yearTo !== "all" ? 1 : 0;
  const other = getActiveFilterCount() - years - (tournament ? 1 : 0);
  return shareScope({
    single,
    series,
    stageTab: state.stageTab,
    yearFrom: filters.yearFrom,
    yearTo: filters.yearTo,
    tournament,
    otherFilters: Math.max(0, other),
  });
}

function formStrip(ordered, series, single, nameA, nameB) {
  const items = ordered.slice(-10).reverse().map((item) => ({
    result: item.result,
    letter: item.result === "A" ? "W" : item.result === "B" ? "L" : "D",
    score: item.type === "series"
      ? formatSeriesScore(item).replace("-", "–")
      : `${item.goals_a}–${item.goals_b}`,
  }));
  const wins = items.filter((item) => item.result === "A").length;
  const losses = items.filter((item) => item.result === "B").length;
  const draws = items.length - wins - losses;
  const unit = series ? "series" : items.length === 1 ? "game" : "games";
  const label = `Last ${items.length === 10 ? 10 : items.length} ${unit} · latest first`;
  const tally = single
    ? [`${wins} W`, draws ? `${draws} D` : "", `${losses} L`].filter(Boolean).join(" · ")
    : `${nameA} ${wins} · ${nameB} ${losses}`;
  return { items, label, tally };
}

function playerMeta(player, extra = []) {
  const enriched = enrichPlayerRecord(player) || {};
  const rank = getWorldRank(enriched);
  return [enriched.country, rank ? `World #${rank}` : "", ...extra].filter(Boolean).join(" · ");
}

// Everything the card shows, read from the page state at the moment of the tap.
export function collectShareData(updated = "") {
  const single = isSinglePlayerMode();
  const series = isSeriesMode();
  const items = state.filteredMatches || [];
  const summary = series ? computeSeriesSummary(items) : computeSummary(items);
  const ordered = getChronologicalItems(items);
  const { winsA, winsB, draws, total } = summary;
  const tournaments = summary.tournaments?.size || 0;
  const nameA = state.playerA?.name || "Player A";
  const nameB = state.playerB?.name || "Player B";
  const [shortA, shortB] = shortNames(nameA, nameB);
  const story = storyFindings(items, single ? {} : { nameA: shortA, nameB: shortB });
  const ratingA = ratingOf(state.playerA.id);
  const base = {
    kind: single ? "player" : "matchup",
    series,
    scope: scopeFromState(single, series),
    site: "h2h.puck.no",
    updated,
    form: formStrip(ordered, series, single, shortA, shortB),
  };
  const unit = series ? "series" : total === 1 ? "game" : "games";
  const drawWord = series ? "tied" : draws === 1 ? "draw" : "draws";
  const share = (count) => (total ? (count / total) * 100 : 0);

  if (single) {
    const born = String(enrichPlayerRecord(state.playerA)?.date_of_birth || "").match(/(\d{4})/)?.[1];
    const records = opponentRecords(items, (id) => getAliasGroup(id)[0]);
    const kpis = [
      { label: series ? "Series" : "Games", value: fmt(total), sub: `${fmt(tournaments)} ${tournaments === 1 ? "tournament" : "tournaments"}` },
      { label: "Win rate", value: total ? pct1(share(winsA)) : "–", sub: `${fmt(records.length)} opponents` },
    ];
    if (ratingA) {
      const rank = getWorldRank(enrichPlayerRecord(state.playerA));
      kpis.push({ label: "Rating", value: fmt(Math.round(ratingA.rating)), sub: rank ? `World #${rank}` : "Glicko-2" });
    } else {
      const diff = total ? (summary.goalsA - summary.goalsB) / total : 0;
      kpis.push({ label: "Goal diff", value: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`, sub: `per ${series ? "series" : "game"}` });
    }
    let ratingChart = null;
    const history = (ratingA?.history || [])
      .map((point) => ({ time: Date.parse(point[0]), value: point[1] }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value));
    if (history.length >= 3) {
      const peak = ratingA.peak;
      const now = Math.round(ratingA.rating);
      const note = peak && Math.round(peak.rating) > now
        ? `Peak ${fmt(Math.round(peak.rating))} in ${monthYear(peak.date)}`
        : "At a career high";
      ratingChart = {
        label: "Rating over time",
        note,
        points: history,
        from: String(new Date(history[0].time).getUTCFullYear()),
        to: `Now ${fmt(now)}`,
      };
    }
    return {
      ...base,
      a: {
        name: nameA,
        meta: playerMeta(state.playerA, [born ? `Born ${born}` : ""]),
      },
      kpis,
      recordBar: {
        label: series ? "Series record" : "Record",
        a: winsA,
        d: draws,
        b: winsB,
        labels: [
          [{ text: fmt(winsA), strong: true }, { text: series ? " won" : winsA === 1 ? " win" : " wins" }],
          [{ text: `${fmt(draws)} ${drawWord}` }],
          [{ text: fmt(winsB), strong: true }, { text: series ? " lost" : winsB === 1 ? " loss" : " losses" }],
        ],
      },
      ratingChart,
      findings: pickFindings(story, ["rivals", "seasons", "nations", "opponents"], "", 4),
    };
  }

  const ratingB = ratingOf(state.playerB.id);
  const headline = buildVerdict({
    ordered,
    nameA: shortA,
    nameB: shortB,
    unit: series ? "series" : "wins",
    tournaments: series ? [] : groupTournaments(items),
  });
  const headlineText = headline.map((part) => part.text).join("");
  const forecast = forecastFor(state.playerA, state.playerB);
  return {
    ...base,
    a: { name: nameA, meta: playerMeta(state.playerA), rating: ratingA ? fmt(Math.round(ratingA.rating)) : "" },
    b: { name: nameB, meta: playerMeta(state.playerB), rating: ratingB ? fmt(Math.round(ratingB.rating)) : "" },
    record: { winsLabelA: fmt(winsA), winsLabelB: fmt(winsB) },
    facts: [`${fmt(total)} ${series ? "playoff series" : unit}`, spanOf(ordered), `${fmt(tournaments)} ${tournaments === 1 ? "tournament" : "tournaments"}`]
      .filter(Boolean)
      .join(" · "),
    recordBar: {
      label: series ? "Series record so far" : "Record so far",
      a: winsA,
      d: draws,
      b: winsB,
      labels: [
        [{ text: pct1(share(winsA)), strong: true }, { text: ` ${shortA}` }],
        // Playoff series are rarely tied; leave the middle empty rather than "0 tied · 0.0%".
        [{ text: series && !draws ? "" : `${fmt(draws)} ${drawWord} · ${pct1(share(draws))}` }],
        [{ text: `${shortB} ` }, { text: pct1(share(winsB)), strong: true }],
      ],
    },
    forecastBar: forecast
      ? {
        label: "If they met today",
        a: forecast[0],
        d: forecast[1],
        b: forecast[2],
        labels: [
          [{ text: pct0(forecast[0]), strong: true }, { text: ` ${shortA}` }],
          [{ text: `Draw ${pct0(forecast[1])}` }],
          [{ text: `${shortB} ` }, { text: pct0(forecast[2]), strong: true }],
        ],
      }
      : null,
    headline,
    findings: pickFindings(story, ["seasons", "tournaments", "lead", "tape"], headlineText, 3),
  };
}

// ── Drawing ─────────────────────────────────────────────────────────

async function waitForFonts(timeoutMs = 4000) {
  let timer;
  try {
    await Promise.race([
      (async () => {
        await document.fonts.ready;
        await Promise.all(CARD_FONTS.map((font) => document.fonts.load(font)));
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Font loading timed out.")), timeoutMs);
      }),
    ]);
  } catch (err) {
    console.warn("Share image: fonts not ready, drawing with fallbacks.", err);
  } finally {
    clearTimeout(timer);
  }
}

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "nbhf-logo.png";
    });
  }
  return logoPromise;
}

// The pair file has only player A's side, so player B's rating needs their own file.
async function ensureRatings() {
  const players = isSinglePlayerMode() ? [state.playerA] : [state.playerA, state.playerB];
  await Promise.all(players.filter(Boolean).map(async (player) => {
    if (ratingOf(player.id)) return;
    try {
      await fetchPlayerPayload(getAliasGroup(player.id)[0]);
    } catch {
      // Drawn without the rating.
    }
  }));
}

function within(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

let updatedPromise = null;
function loadUpdatedLabel() {
  if (!updatedPromise) {
    updatedPromise = fetchJson("data/meta.json", 5000)
      .then((meta) => {
        const day = String(meta?.generated_at || "").slice(0, 10);
        return day ? `Updated ${formatDate(day)}` : "";
      })
      .catch(() => "");
  }
  return updatedPromise;
}

async function renderCard(data, theme) {
  const [logo] = await Promise.all([loadLogo(), waitForFonts()]);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  drawShareCard(canvas.getContext("2d"), data, { theme, logo });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the image.");
  return blob;
}

// ── Dialog ──────────────────────────────────────────────────────────

const ICON_PATHS = {
  close: ["M6 6l12 12", "M18 6L6 18"],
  share: ["M12 3v12", "M7 8l5-5 5 5", "M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  check: "M5 12.5l4.5 4.5L19 7",
};

const session = {
  dialog: null,
  parts: null,
  data: null,
  theme: "light",
  blob: null,
  url: "",
  file: null,
  shareUrl: "",
  token: 0,
  resetTimer: 0,
};

function pageTheme() {
  const attr = document.body.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function canShareFiles() {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["x"], { type: "image/png" })], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function canCopyImage() {
  return Boolean(navigator.clipboard?.write) && typeof window.ClipboardItem === "function";
}

function actionButton(kind, label, primary = false) {
  const button = el("button", {
    type: "button",
    class: `btn share-action${primary ? " primary" : ""}`,
    dataset: { action: kind },
  }, icon(ICON_PATHS[kind]), el("span", {}, label));
  button.dataset.label = label;
  return button;
}

function buildDialog() {
  const title = el("h2", { id: "share-dialog-title", class: "share-dialog-title" }, "Share image");
  const close = el("button", {
    type: "button",
    class: "icon-button share-dialog-close",
    "aria-label": "Close",
  }, icon(ICON_PATHS.close));
  const img = el("img", { class: "share-preview-img", alt: "", width: CARD_WIDTH, height: CARD_HEIGHT, hidden: true });
  const skeleton = el("div", { class: "share-preview-skeleton", "aria-hidden": "true" },
    el("span", { class: "share-spinner" }));
  const preview = el("div", { class: "share-preview", "aria-busy": "true" }, skeleton, img);
  const themeButtons = ["light", "dark"].map((value) => el("button", {
    type: "button",
    class: "share-theme-option",
    "aria-pressed": "false",
    dataset: { theme: value },
  }, value === "light" ? "Light" : "Dark"));
  const themeGroup = el("div", { class: "share-theme", role: "group", "aria-label": "Image theme" }, ...themeButtons);
  const shareBtn = actionButton("share", "Share…", true);
  const copyBtn = actionButton("copy", "Copy image");
  const downloadBtn = actionButton("download", "Download");
  const actions = el("div", { class: "share-actions" }, shareBtn, copyBtn, downloadBtn);
  const status = el("p", { class: "share-status", role: "status", "aria-live": "polite" });

  const dialog = el("dialog", {
    class: "share-dialog",
    "aria-labelledby": "share-dialog-title",
  },
  el("div", { class: "share-dialog-head" }, title, close),
  preview,
  el("div", { class: "share-controls" }, themeGroup),
  actions,
  status);

  close.addEventListener("click", () => dialog.close());
  // A tap on the backdrop (outside the panel) closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener("close", onDialogClose);
  themeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.theme !== session.theme) {
      session.theme = button.dataset.theme;
      generate();
    }
  }));
  shareBtn.addEventListener("click", onShare);
  copyBtn.addEventListener("click", onCopy);
  downloadBtn.addEventListener("click", onDownload);

  document.body.append(dialog);
  session.dialog = dialog;
  session.parts = { preview, img, skeleton, themeButtons, shareBtn, copyBtn, downloadBtn, status, close };
}

function setStatus(message, tone = "") {
  const { status } = session.parts;
  status.textContent = message;
  status.dataset.tone = tone;
}

function resetActionLabels() {
  clearTimeout(session.resetTimer);
  const { shareBtn, copyBtn, downloadBtn } = session.parts;
  [shareBtn, copyBtn, downloadBtn].forEach((button) => {
    button.classList.remove("is-done");
    button.querySelector("span").textContent = button.dataset.label;
    button.replaceChild(icon(ICON_PATHS[button.dataset.action]), button.querySelector("svg"));
  });
}

// Brief "done" state on a button: check icon and a new label, then back.
function flashDone(button, label) {
  resetActionLabels();
  button.classList.add("is-done");
  button.querySelector("span").textContent = label;
  button.replaceChild(icon(ICON_PATHS.check), button.querySelector("svg"));
  session.resetTimer = setTimeout(resetActionLabels, 2200);
}

function setBusy(busy) {
  const { preview, skeleton, shareBtn, copyBtn, downloadBtn, themeButtons } = session.parts;
  preview.setAttribute("aria-busy", busy ? "true" : "false");
  preview.classList.toggle("is-busy", busy);
  skeleton.hidden = !busy;
  [shareBtn, copyBtn, downloadBtn].forEach((button) => { button.disabled = busy; });
  themeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.theme === session.theme ? "true" : "false");
  });
}

function fileName() {
  const a = state.playerA;
  const b = state.playerB;
  return session.data.kind === "player"
    ? `${sanitizeName(a?.name, `player_${a?.id}`)}_profile.png`
    : `${sanitizeName(a?.name, `player_${a?.id}`)}_vs_${sanitizeName(b?.name, `player_${b?.id || "b"}`)}_h2h.png`;
}

function canonicalUrl() {
  try {
    const url = new URL(window.location.href);
    url.protocol = "https:";
    url.host = "h2h.puck.no";
    url.port = "";
    return url.toString();
  } catch {
    return "https://h2h.puck.no/";
  }
}

function altText(data) {
  if (data.kind === "player") {
    return `Share image for ${data.a.name}: ${data.kpis.map((k) => `${k.label} ${k.value}`).join(", ")}.`;
  }
  return `Share image: ${data.a.name} ${data.record.winsLabelA}, ${data.b.name} ${data.record.winsLabelB}. ${data.facts}.`;
}

async function generate() {
  const token = ++session.token;
  resetActionLabels();
  setBusy(true);
  setStatus("Making the image…");
  try {
    const blob = await renderCard(session.data, session.theme);
    if (token !== session.token || !session.dialog.open) return;
    if (session.url) URL.revokeObjectURL(session.url);
    session.blob = blob;
    session.url = URL.createObjectURL(blob);
    session.file = new File([blob], fileName(), { type: "image/png" });
    const { img } = session.parts;
    img.src = session.url;
    img.alt = altText(session.data);
    img.hidden = false;
    setBusy(false);
    setStatus("");
  } catch (err) {
    if (token !== session.token) return;
    console.error("Could not create share image:", err);
    setBusy(false);
    [session.parts.shareBtn, session.parts.copyBtn, session.parts.downloadBtn].forEach((b) => { b.disabled = true; });
    setStatus("Could not make the image. Close this and try again.", "error");
  }
}

async function onShare() {
  if (!session.file) return;
  const data = session.data;
  const title = data.kind === "player" ? `${data.a.name} · Table Hockey H2H` : `${data.a.name} vs ${data.b.name} · Table Hockey H2H`;
  const text = data.kind === "player"
    ? `${data.a.name}'s career stats: ${session.shareUrl}`
    : `${data.a.name} vs ${data.b.name}, head to head: ${session.shareUrl}`;
  try {
    await navigator.share({ files: [session.file], title, text });
    flashDone(session.parts.shareBtn, "Shared");
    setStatus("Shared.", "ok");
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("Share sheet failed:", err);
    setStatus("The share sheet didn't open. Copy or download the image instead.", "error");
  }
}

async function onCopy() {
  if (!session.blob) return;
  const button = session.parts.copyBtn;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": session.blob })]);
    flashDone(button, "Copied");
    setStatus("Image copied. Paste it into a post or chat.", "ok");
  } catch (err) {
    console.warn("Copy image failed:", err);
    setStatus("Your browser blocked copying. Download the image instead.", "error");
  }
}

function onDownload() {
  if (!session.blob) return;
  const a = document.createElement("a");
  a.href = session.url;
  a.download = session.file.name;
  document.body.append(a);
  a.click();
  a.remove();
  flashDone(session.parts.downloadBtn, "Saved");
  setStatus(`Saved as ${session.file.name}.`, "ok");
}

function onDialogClose() {
  session.token += 1;
  clearTimeout(session.resetTimer);
  if (session.url) URL.revokeObjectURL(session.url);
  session.url = "";
  session.blob = null;
  session.file = null;
  const { img } = session.parts;
  img.hidden = true;
  img.removeAttribute("src");
  document.body.classList.remove("share-open");
  updateSelectionControls();
  elements.shareImageBtn?.focus();
}

export async function handleShareImage() {
  if (!state.playerA || !state.filteredMatches?.length) return;
  if (session.dialog?.open) return;
  if (!session.dialog) buildDialog();

  const { shareBtn, copyBtn } = session.parts;
  const share = canShareFiles();
  shareBtn.hidden = !share;
  copyBtn.hidden = !canCopyImage();
  copyBtn.classList.toggle("primary", !share);
  session.theme = pageTheme();
  session.shareUrl = canonicalUrl();

  // Open first so the tap gets an answer at once; the modal keeps the view still meanwhile.
  document.body.classList.add("share-open");
  session.dialog.showModal();
  session.parts.close.focus();
  const token = ++session.token;
  resetActionLabels();
  setBusy(true);
  setStatus("Making the image…");

  const [updated] = await Promise.all([
    within(loadUpdatedLabel(), 600, ""),
    within(ensureRatings(), 3000, null),
  ]);
  if (token !== session.token || !session.dialog.open) return;
  try {
    session.data = collectShareData(updated);
  } catch (err) {
    console.error("Could not read the view for the share image:", err);
    setBusy(false);
    [shareBtn, copyBtn, session.parts.downloadBtn].forEach((b) => { b.disabled = true; });
    setStatus("Could not make the image. Close this and try again.", "error");
    return;
  }
  generate();
}
