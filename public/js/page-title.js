// Page titles shared by the browser tab and the server-rendered page head
// (functions/index.js), so a shared link and the open tab read the same.
export const SITE_NAME = "Table Hockey H2H";

const SECTION_TITLES = {
  records: "Records",
  rivalries: "Rivalries",
  players: "Players",
};

export function pageTitle({ nameA = "", nameB = "", section = "" } = {}) {
  if (nameA && nameB) return `${nameA} vs ${nameB} · ${SITE_NAME}`;
  if (nameA) return `${nameA} · ${SITE_NAME}`;
  if (SECTION_TITLES[section]) return `${SECTION_TITLES[section]} · ${SITE_NAME}`;
  return SITE_NAME;
}
