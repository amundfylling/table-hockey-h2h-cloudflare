// theme.ts - brand tokens: colors, fonts, canvas size.
//
// Every value in `colors` and `fonts` is a PLACEHOLDER. Replace them with the
// product's real brand before the first render. Components read these tokens
// and never hard-code a hex value, so the whole film re-skins from this file.
// If you change a font family here, change the matching loadFont() in Root.tsx.

// The site's dark theme tokens (public/styles.css, [data-theme="dark"]).
export const colors = {
  accent: "#F07A52", // --b: player B, the brand orange
  accentSoft: "rgba(240, 122, 82, 0.2)",
  onAccent: "#FFFFFF",
  teal: "#4DBFA3", // --a: player A
  background: "#0F1113", // --bg
  surface: "#171A1D", // --surface
  ink: "#EEF0F2", // --ink
  inkSoft: "#1E2226", // --sunk
  inkMuted: "#9AA1A9",
  border: "#262B30", // --line
  shadowTint: "rgba(0, 0, 0, 0.45)",
  logo: "#E0603B", // favicon tile
} as const;

// The site's families: Schibsted Grotesk for text, Barlow Condensed for numerals.
export const fonts = {
  display: "Schibsted Grotesk, Golos Text, system-ui, sans-serif",
  editorial: "Schibsted Grotesk, Golos Text, system-ui, sans-serif",
  ui: "Schibsted Grotesk, Golos Text, system-ui, sans-serif",
  num: "Barlow Condensed, Schibsted Grotesk, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

// This film is vertical only, so the master itself is 9:16.
export const canvas = { width: 1080, height: 1920 } as const;
export const canvasVertical = { width: 1080, height: 1920 } as const;

/** Blend two #rrggbb colors; t = 0 gives a, t = 1 gives b. For scene-background shifts without a cut. */
export const blendHex = (a: string, b: string, t: number): string => {
  const channels = (hex: string) =>
    [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return `#${[ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]
    .map((n) => Math.round(n).toString(16).padStart(2, "0"))
    .join("")}`;
};
