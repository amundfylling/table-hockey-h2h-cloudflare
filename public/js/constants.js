export const COL_INFO = { label: "", key: null };
export const COL_DATE = { label: "Date", key: "date", defaultDirection: "desc" };
export const COL_OPPONENT = { label: "Opponent", key: "opponent", defaultDirection: "asc" };
export const COL_TOURNAMENT = { label: "Tournament", key: "tournament", defaultDirection: "asc" };
export const COL_STAGE = { label: "Stage", key: "stage", defaultDirection: "asc" };
export const COL_ROUND = { label: "Round", key: "round", defaultDirection: "asc" };
export const COL_SCORE = { label: "Score", key: "score", defaultDirection: "desc" };
export const COL_OT = { label: "OT", key: "ot", defaultDirection: "desc" };
export const COL_WINNER = { label: "Winner", key: "winner", defaultDirection: "asc" };
export const COL_SERIES = { label: "Series", key: "series", defaultDirection: "asc" };
export const COL_GAMES = { label: "Games", key: "games", defaultDirection: "desc" };
export const COL_GOALS = { label: "Goals", key: "goals", defaultDirection: "desc" };

export const GAME_TABLE_COLUMNS = [
  COL_INFO, COL_DATE, COL_TOURNAMENT, COL_STAGE, COL_ROUND, COL_SCORE, COL_OT, COL_WINNER
];
export const SINGLE_TABLE_COLUMNS = [
  COL_INFO, COL_DATE, COL_OPPONENT, COL_TOURNAMENT, COL_STAGE, COL_ROUND, COL_SCORE, COL_OT, COL_WINNER
];
export const SERIES_TABLE_COLUMNS = [
  COL_INFO, COL_DATE, COL_TOURNAMENT, COL_STAGE, COL_SERIES, COL_GAMES, COL_GOALS, COL_WINNER
];
export const SINGLE_SERIES_TABLE_COLUMNS = [
  COL_INFO, COL_DATE, COL_OPPONENT, COL_TOURNAMENT, COL_STAGE, COL_SERIES, COL_GAMES, COL_GOALS, COL_WINNER
];

export const URL_PARAM_KEYS = [
  "p1", "p2", "p1g", "p2g", "stage", "playoffMode", "goalsMode", "search",
  "yearFrom", "yearTo", "tournament", "levels", "stageDetail", "ot", "tight", "bestOf"
];

export const SVG_SUN = `
  <circle cx="12" cy="12" r="5"></circle>
  <line x1="12" y1="1" x2="12" y2="3"></line>
  <line x1="12" y1="21" x2="12" y2="23"></line>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
  <line x1="1" y1="12" x2="3" y2="12"></line>
  <line x1="21" y1="12" x2="23" y2="12"></line>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
`;

export const SVG_MOON = `
  <path d="M12 3a6 6 0 0 0 9 7.4A9 9 0 1 1 12 3z"></path>
`;

export const SVG_TREND = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
`;

export const SVG_BAR_CHART = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
`;

export const COUNTRY_FLAGS = new Map(Object.entries({
  "belarus": "🇧🇾", "canada": "🇨🇦", "chile": "🇨🇱", "czech republic": "🇨🇿", "denmark": "🇩🇰", "estonia": "🇪🇪",
  "finland": "🇫🇮", "france": "🇫🇷", "germany": "🇩🇪", "hungary": "🇭🇺", "iceland": "🇮🇸", "ireland": "🇮🇪",
  "israel": "🇮🇱", "italy": "🇮🇹", "kazakhstan": "🇰🇿", "kazakistan": "🇰🇿", "kyrgyzstan": "🇰🇬", "latvia": "🇱🇻",
  "netherlands": "🇳🇱", "norway": "🇳🇴", "pakistan": "🇵🇰", "portugal": "🇵🇹", "republic of lithuania": "🇱🇹",
  "russia": "🇷🇺", "россия": "🇷🇺", "serbia": "🇷🇸", "slovakia": "🇸🇰", "slovenia": "🇸🇮", "spain": "🇪🇸",
  "sri lanka": "🇱🇰", "sweden": "🇸🇪", "sweden / portugal": "🇸🇪/🇵🇹", "switzerland": "🇨🇭", "syria": "🇸🇾",
  "tajikistan": "🇹🇯", "ukraine": "🇺🇦", "united kingdom": "🇬🇧", "united states of america": "🇺🇸"
}).map(([k, v]) => [k, v]));
