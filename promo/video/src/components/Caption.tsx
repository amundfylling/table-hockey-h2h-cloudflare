// Caption - a short line above the phone that says what the demo is showing. Each line comes in
// on a bass hit (a cut or a tap), so the caption change is one of the film's hits too.
// It sits outside the scenes, so camera moves never scale it; a scrim at the top keeps it
// readable when the camera pushes the phone up under it.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { easings } from "../easings";
import { colors, fonts } from "../theme";
import { CAPTION_BAND } from "./Phone";

export type CaptionLine = { at: number; text: string };

const IN = 8;
const OUT = 5;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Captions: React.FC<{ lines: CaptionLine[]; until: number }> = ({ lines, until }) => {
  const frame = useCurrentFrame();
  const first = lines[0]?.at ?? Infinity;
  if (frame < first || frame >= until) return null;
  const scrim = interpolate(frame, [first, first + IN, until - OUT, until], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: CAPTION_BAND + 60,
          opacity: scrim,
          background: `linear-gradient(${colors.background} 0%, ${colors.background} 72%, rgba(15, 17, 19, 0) 100%)`,
        }}
      />
      {lines.map((line, i) => {
        const end = lines[i + 1]?.at ?? until;
        if (frame < line.at || frame >= end) return null;
        const p = easings.slowInLand(interpolate(frame, [line.at, line.at + IN], [0, 1], clamp));
        const q = easings.standard(interpolate(frame, [end - OUT, end], [0, 1], clamp));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 70,
              right: 70,
              top: 0,
              height: CAPTION_BAND,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 62,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: colors.ink,
              transform: `translateY(${(1 - p) * 40 - q * 24}px)`,
              opacity: p * (1 - q),
              filter: `blur(${(1 - p) * 8}px)`,
            }}
          >
            {line.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
