// Footage - a recorded take of the real production site, with its taps drawn on top.
//
// The takes come from promo/capture: 60 fps, 1170x2532 (an iPhone viewport at 3x), and a
// take.json that logs every tap in CSS px and ms from the take's t=0. Nothing on the site
// is redrawn here; the only thing added is the tap mark a finger would leave.
//
// The footage fills the frame's width, so the phone viewport (390x844) is taller than
// 9:16 and its bottom 18% falls below the frame. Scenes frame the part that matters with
// the Stage camera.

import { Video } from "@remotion/media";
import { interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { easings } from "../easings";
import { colors } from "../theme";

export type TakeEvent = {
  t: number;
  type: string;
  label?: string;
  x?: number;
  y?: number;
};
export type Take = { name: string; size: number[]; scale: number; events: TakeEvent[] };

const CSS_WIDTH = 390;

/** Px per CSS px of the site when the footage fills the frame's width. */
export const useSiteScale = () => CSS_WIDTH / useVideoConfig().width;

/** Scene-local frame of a take event, when the take's t=0 sits on scene frame `at`. */
export const eventFrame = (take: Take, label: string, at: number, fps: number): number => {
  const e = take.events.find((ev) => ev.label === label);
  if (!e) throw new Error(`[footage] no event "${label}" in take ${take.name}`);
  return at + Math.round((e.t / 1000) * fps);
};

const TAP_FRAMES = 14;

const TapMark: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at - 2, at + TAP_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (frame < at - 2 || frame > at + TAP_FRAMES) return null;
  const press = interpolate(frame, [at - 2, at, at + 5], [0.6, 1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring = easings.slowInLand(p);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 34,
          top: y - 34,
          width: 68,
          height: 68,
          borderRadius: 34,
          background: "rgba(255, 255, 255, 0.28)",
          transform: `scale(${press})`,
          opacity: interpolate(frame, [at + 4, at + TAP_FRAMES], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 34,
          top: y - 34,
          width: 68,
          height: 68,
          borderRadius: 34,
          border: `4px solid ${colors.ink}`,
          transform: `scale(${1 + ring * 1.1})`,
          opacity: 0.8 * (1 - ring),
        }}
      />
    </>
  );
};

export const Footage: React.FC<{
  src: string;
  take: Take;
  /** Scene-local frame the take's t=0 plays on. */
  at?: number;
  /** Seconds into the take to begin (for a take whose start is cut off). */
  skip?: number;
}> = ({ src, take, at = 0, skip = 0 }) => {
  const { width, fps } = useVideoConfig();
  const k = width / CSS_WIDTH;
  const height = Math.round((width * take.size[1]) / take.size[0]);
  const shift = at - Math.round(skip * fps);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
      <Video
        src={staticFile(src)}
        trimBefore={Math.max(0, Math.round(skip * fps) - at)}
        muted
        style={{ width, height }}
      />
      {take.events
        .filter((e) => e.type === "tap" && e.x !== undefined && e.y !== undefined)
        .map((e, i) => (
          <TapMark key={i} x={e.x! * k} y={e.y! * k} at={shift + Math.round((e.t / 1000) * fps)} />
        ))}
    </div>
  );
};
