// Footage - a recorded take of the real production site, with its taps drawn on top.
//
// The takes come from promo/capture: 60 fps, 1206x2460 (the web view of an iPhone 18 Pro,
// 402x820 pt below the status bar, at 3x), and a take.json that logs every tap in CSS px and
// ms from the take's t=0. Nothing on the site is redrawn here; the only thing added is the
// mark a fingertip leaves. Footage is drawn at a given width (the phone's screen) and the tap
// marks scale with it.

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
export type Take = { name: string; size: number[]; scale: number; bpm: number; events: TakeEvent[] };

/** Scene-local frame of a take event, when the take's t=0 sits on scene frame `at`. */
export const eventFrame = (take: Take, label: string, at: number, fps: number): number => {
  const e = take.events.find((ev) => ev.label === label);
  if (!e) throw new Error(`[footage] no event "${label}" in take ${take.name}`);
  return at + Math.round((e.t / 1000) * fps);
};

const TAP_FRAMES = 14;

/** A fingertip press: a soft disc that shrinks a little as it lifts, and a ring that spreads. */
const TapMark: React.FC<{ x: number; y: number; at: number; size: number }> = ({ x, y, at, size }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2 || frame > at + TAP_FRAMES) return null;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const p = interpolate(frame, [at - 2, at + TAP_FRAMES], [0, 1], clamp);
  const press = interpolate(frame, [at - 2, at, at + 5], [0.6, 1, 0.85], clamp);
  const ring = easings.slowInLand(p);
  const r = size / 2;
  const disc: React.CSSProperties = { position: "absolute", left: x - r, top: y - r, width: size, height: size, borderRadius: r };
  return (
    <>
      <div
        style={{
          ...disc,
          background: "rgba(255, 255, 255, 0.3)",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15)",
          transform: `scale(${press})`,
          opacity: interpolate(frame, [at + 4, at + TAP_FRAMES], [1, 0], clamp),
        }}
      />
      <div
        style={{
          ...disc,
          border: `${Math.max(2, size / 17)}px solid ${colors.ink}`,
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
  /** Drawn width in px; the height follows the take's aspect. Default: the frame's width. */
  width?: number;
  /** Seconds into the take on the scene's first frame. */
  skip?: number;
  /** Playback speed of the take, to stretch it a little so two of its events both land on hits. */
  rate?: number;
}> = ({ src, take, width: w, skip = 0, rate = 1 }) => {
  const { width: frameWidth, fps } = useVideoConfig();
  const width = w ?? frameWidth;
  const cssWidth = take.size[0] / take.scale;
  const k = width / cssWidth; // px per CSS px of the site
  const height = Math.round((width * take.size[1]) / take.size[0]);
  const trim = Math.round(skip * fps);
  const at = (t: number) => Math.round(((t / 1000) * fps - trim) / rate);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
      <Video src={staticFile(src)} trimBefore={trim} playbackRate={rate} muted style={{ width, height }} />
      {take.events
        .filter((e) => e.type === "tap" && e.x !== undefined && e.y !== undefined)
        .map((e, i) => (
          <TapMark key={i} x={e.x! * k} y={e.y! * k} size={44 * k} at={at(e.t)} />
        ))}
    </div>
  );
};
