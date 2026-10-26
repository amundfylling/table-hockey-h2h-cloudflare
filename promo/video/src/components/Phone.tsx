// Phone - an iPhone 18 Pro drawn in code, with the real site's footage as its screen.
//
// Sizes follow the device in points: a 402x874 pt screen with ~55 pt corners, a 54 pt status bar
// with the Dynamic Island (126x37 pt, 11 pt from the top) and a home indicator. The frame is a
// thin black border inside a titanium edge, with the side buttons. Everything is scaled by PT
// (canvas px per point). No Apple artwork is used; it is all boxes and two small icons.
//
// The status bar follows the site's theme: `light` says whether the page under it is in light
// mode (the site's header colour shows through, as in Safari).

import { AbsoluteFill } from "remotion";
import { canvas, colors, fonts } from "../theme";

/** Canvas px per point. */
export const PT = 1.72;
export const SCREEN = { w: 402, h: 874, statusBar: 54, radius: 55 };
const BORDER = 5; // pt, black glass border
const EDGE = 3; // pt, titanium band
const OUTER = { w: SCREEN.w + 2 * (BORDER + EDGE), h: SCREEN.h + 2 * (BORDER + EDGE) };

/** Space above the phone for the captions (Caption.tsx), and below it. */
export const CAPTION_BAND = 330;
/** Top-left of the phone body on the canvas: centred across, below the caption band. */
export const PHONE_ORIGIN = {
  x: (canvas.width - OUTER.w * PT) / 2,
  y: CAPTION_BAND,
};

/** Canvas position of a CSS point in the web view (below the status bar). */
export const siteToCanvas = (x: number, y: number) => ({
  x: PHONE_ORIGIN.x + (BORDER + EDGE + x) * PT,
  y: PHONE_ORIGIN.y + (BORDER + EDGE + SCREEN.statusBar + y) * PT,
});

const LIGHT_BG = "#F4F3EF"; // the site's --bg in light mode

const StatusBar: React.FC<{ light: boolean }> = ({ light }) => {
  const ink = light ? "#15181B" : "#FFFFFF";
  const h = SCREEN.statusBar * PT;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SCREEN.w * PT,
        height: h,
        background: light ? LIGHT_BG : colors.background,
        color: ink,
        fontFamily: fonts.ui,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 52 * PT,
          top: 19 * PT,
          fontSize: 17 * PT,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        9:41
      </div>
      {/* Signal, Wi-Fi and battery, drawn as simple shapes. */}
      <svg
        style={{ position: "absolute", right: 30 * PT, top: 22 * PT }}
        width={78 * PT}
        height={13 * PT}
        viewBox="0 0 78 13"
      >
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 4.6} y={9 - i * 2.6} width={3.2} height={3.4 + i * 2.6} rx={0.8} fill={ink} />
        ))}
        <path
          d="M 30.5 3.6 A 9 9 0 0 1 43.5 3.6 L 41.8 5.4 A 6.6 6.6 0 0 0 32.2 5.4 Z M 33.9 7.1 A 4.3 4.3 0 0 1 40.1 7.1 L 38.4 8.9 A 1.9 1.9 0 0 0 35.6 8.9 Z M 37 10.4 L 38.3 11.7 L 37 13 L 35.7 11.7 Z"
          fill={ink}
        />
        <rect x={50} y={0.8} width={24} height={11.4} rx={3.6} fill="none" stroke={ink} strokeOpacity={0.4} strokeWidth={1} />
        <rect x={52} y={2.8} width={18} height={7.4} rx={2} fill={ink} />
        <path d="M 75.5 4.6 Q 77 5 77 6.5 Q 77 8 75.5 8.4 Z" fill={ink} fillOpacity={0.4} />
      </svg>
    </div>
  );
};

export const Phone: React.FC<{ light?: boolean; children: React.ReactNode }> = ({ light = false, children }) => {
  const outerR = (SCREEN.radius + BORDER + EDGE) * PT;
  const button = (side: "left" | "right", top: number, height: number): React.CSSProperties => ({
    position: "absolute",
    [side]: -2.2 * PT,
    top: top * PT,
    width: 3.2 * PT,
    height: height * PT,
    borderRadius: 2 * PT,
    background: "linear-gradient(90deg, #6E7276, #A9ADB1 50%, #6E7276)",
  });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: PHONE_ORIGIN.x,
          top: PHONE_ORIGIN.y,
          width: OUTER.w * PT,
          height: OUTER.h * PT,
        }}
      >
        <div style={button("left", 132, 34)} />
        <div style={button("left", 190, 62)} />
        <div style={button("left", 266, 62)} />
        <div style={button("right", 214, 96)} />
        {/* Titanium band, then the black border, then the screen. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: outerR,
            background: "linear-gradient(135deg, #8E9296 0%, #4A4E53 30%, #5C6065 70%, #9A9EA2 100%)",
            boxShadow: "0 50px 140px rgba(0, 0, 0, 0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: EDGE * PT,
            borderRadius: outerR - EDGE * PT,
            background: "#050506",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: (EDGE + BORDER) * PT,
            top: (EDGE + BORDER) * PT,
            width: SCREEN.w * PT,
            height: SCREEN.h * PT,
            borderRadius: SCREEN.radius * PT,
            overflow: "hidden",
            background: light ? LIGHT_BG : colors.background,
            // Keeps the rounded clip on the video layer in Chrome.
            isolation: "isolate",
          }}
        >
          <div style={{ position: "absolute", left: 0, top: SCREEN.statusBar * PT, width: SCREEN.w * PT }}>
            {children}
          </div>
          <StatusBar light={light} />
          {/* Dynamic Island */}
          <div
            style={{
              position: "absolute",
              left: ((SCREEN.w - 126) / 2) * PT,
              top: 11 * PT,
              width: 126 * PT,
              height: 37 * PT,
              borderRadius: 18.5 * PT,
              background: "#000000",
            }}
          />
          {/* Home indicator */}
          <div
            style={{
              position: "absolute",
              left: ((SCREEN.w - 140) / 2) * PT,
              bottom: 8 * PT,
              width: 140 * PT,
              height: 5 * PT,
              borderRadius: 3 * PT,
              background: light ? "#15181B" : "#FFFFFF",
              opacity: 0.85,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Width of the web view in canvas px, for <Footage width>. */
export const SCREEN_PX = SCREEN.w * PT;
