export function normalizeText(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function decodeHtmlEntities(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export const TOURNAMENT_LEVEL_NA = "__na__";

export function normalizeTournamentLevel(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (["nan", "none", "null", "na", "n/a"].includes(text.toLowerCase())) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return String(numeric);
  }
  return text;
}

export function getTournamentLevelKey(item) {
  return normalizeTournamentLevel(item?.tournament_level) || TOURNAMENT_LEVEL_NA;
}

export function getTournamentLevelLabel(value) {
  return value === TOURNAMENT_LEVEL_NA ? "N/A" : `Level ${value}`;
}

export function compareTournamentLevelKeys(a, b) {
  if (a === TOURNAMENT_LEVEL_NA && b === TOURNAMENT_LEVEL_NA) return 0;
  if (a === TOURNAMENT_LEVEL_NA) return 1;
  if (b === TOURNAMENT_LEVEL_NA) return -1;
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  return String(a).localeCompare(String(b));
}

export function parseOvertime(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (["0", "false", "no", "none", "null", "na"].includes(text)) return false;
  return text.includes("ot") || text.includes("over");
}

export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export function formatDateRange(start, end) {
  const first = formatDate(start);
  const last = formatDate(end);
  if (first === last || last === "-") return first;
  return `${first} - ${last}`;
}

export function classifyStage(stage) {
  const text = normalizeText(stage);
  if (!text) return "other";
  if (text.includes("team")) {
    return "round-robin";
  }
  if (
    text.includes("playoff") ||
    text.includes("knockout") ||
    text.includes("elimination") ||
    text.includes("bracket") ||
    text.includes("final") ||
    text.includes("semi") ||
    text.includes("quarter") ||
    text.includes("round of") ||
    text.includes("1/")
  ) {
    return "playoff";
  }
  if (text.includes("round") || text.includes("group") || text.includes("rr") || text.includes("league")) {
    return "round-robin";
  }
  return "other";
}

export function normalizeStageType(value, stage, tournamentName) {
  const stageText = normalizeText(stage);
  const tournText = normalizeText(tournamentName);
  if (stageText.includes("team") || tournText.includes("team")) {
    return "round-robin";
  }
  const text = normalizeText(value).replace(/_/g, "-");
  if (text === "playoff") return "playoff";
  if (text === "round-robin" || text === "round robin") return "round-robin";
  return classifyStage(stage);
}

export function normalizeStageName(stage, stageType) {
  if (!stage) return "";
  if (stageType === "round-robin") {
    const lowerStage = stage.toLowerCase();
    if (lowerStage === "playoff" || lowerStage === "playoffs") {
      return "Round-Robin";
    } else if (lowerStage.includes("playoff")) {
      return stage.replace(/playoffs?/gi, "Round-Robin");
    }
  }
  return stage;
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
