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
  /** A drag's end x (CSS px); the finger moves from x to x1 over `ms`. */
  x1?: number;
  ms?: number;
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

/**
 * Where a take sits in a scene. One anchor puts that event on the given scene frame; two also
 * set the playback rate so both land on their frames (a take tapped on an even grid against a
 * track that drifts a little). Returns the skip (seconds into the take on frame 0) and the rate.
 */
export const placeTake = (
  take: Take,
  anchors: { label: string; frame: number }[],
  fps: number,
): { skip: number; rate: number } => {
  const t = (label: string) => {
    const e = take.events.find((ev) => ev.label === label);
    if (!e) throw new Error(`[footage] no event "${label}" in take ${take.name}`);
    return (e.t / 1000) * fps;
  };
  const [a, b] = anchors;
  const rate = b ? (t(b.label) - t(a.label)) / (b.frame - a.frame) : 1;
  const trim = t(a.label) - a.frame * rate;
  if (trim < -0.5) throw new Error(`[footage] take ${take.name} starts too late for anchor "${a.label}"`);
  return { skip: Math.max(0, trim) / fps, rate };
};

/** A finger held on the screen while it slides from x to x1. */
const DragMark: React.FC<{ x: number; x1: number; y: number; at: number; frames: number; size: number }> = ({
  x,
  x1,
  y,
  at,
  frames,
  size,
}) => {
  const frame = useCurrentFrame();
  if (frame < at - 3 || frame > at + frames + 6) return null;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const p = easings.standard(interpolate(frame, [at, at + frames], [0, 1], clamp));
  const o = interpolate(frame, [at - 3, at, at + frames, at + frames + 6], [0, 1, 1, 0], clamp);
  const r = size / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: x + (x1 - x) * p - r,
        top: y - r,
        width: size,
        height: size,
        borderRadius: r,
        background: "rgba(255, 255, 255, 0.3)",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15)",
        opacity: o,
      }}
    />
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
      {take.events
        .filter((e) => e.type === "drag" && e.x !== undefined && e.x1 !== undefined)
        .map((e, i) => (
          <DragMark
            key={`d${i}`}
            x={e.x! * k}
            x1={e.x1! * k}
            y={e.y! * k}
            size={44 * k}
            at={at(e.t)}
            frames={Math.round(((e.ms ?? 650) / 1000) * fps / rate)}
          />
        ))}
    </div>
  );
};
