// fx.ts - the transition style switch and the bass-driven camera helpers.
//
// Every candidate look is a value of Fx, passed to the master as a prop, so a veto is one
// token and the earlier look stays reachable. "v2" is the cut the owner saw at checkpoint 2.
//   slam   impact: the drop slams the site in with blur and a flash, 808s kick the camera
//   mask   the site is seen through the hook's letters, and the camera dives through the "?"
//   phone  the site arrives as a phone screen swinging flat in 3D, 808s nudge it
//   mix    mask's dive on the drop, then slam's cuts, flashes and kicks for the rest

import { createContext, useContext } from "react";
import { random } from "remotion";
import type { Move } from "./components/Stage";

export const FX = ["v2", "slam", "mask", "phone", "mix"] as const;
export type Fx = (typeof FX)[number];

export const FxContext = createContext<Fx>("v2");
export const useFx = () => useContext(FxContext);

/** A decaying kick: 1 on a hit, falling off over `decay` frames. Sums overlapping hits. */
export const kick = (frame: number, hits: number[], decay = 6): number =>
  hits.reduce((sum, h) => (frame >= h && frame < h + decay * 4 ? sum + Math.exp(-(frame - h) / decay) : sum), 0);

/** Deterministic shake in px for a few frames after each hit. */
export const shake = (frame: number, hits: number[], amp: number, frames = 5): { x: number; y: number } => {
  for (const h of hits) {
    if (frame >= h && frame < h + frames) {
      const fall = 1 - (frame - h) / frames;
      return {
        x: (random(`sx${frame}`) * 2 - 1) * amp * fall,
        y: (random(`sy${frame}`) * 2 - 1) * amp * fall,
      };
    }
  }
  return { x: 0, y: 0 };
};

/** Styles whose later cuts slam in with a flash (Master draws the flash). */
export const slams = (fx: Fx) => fx === "slam" || fx === "mix";

/**
 * How a footage scene enters and leaves, and the extra motion its bass hits add, for a style.
 * `wrap` is a CSS transform for a layer inside the Stage (so it stacks on the camera).
 */
export const cutStyle = (
  fx: Fx,
  frame: number,
  hits: number[],
): { enter: Move; exit: Move; wrap: string } => {
  if (slams(fx)) {
    const sh = shake(frame, hits, 16);
    return {
      enter: { kind: "pull-back", from: 1.45, blur: 16, frames: 10 },
      exit: { kind: "push", from: 2.2, frames: 7 },
      wrap: `translate(${sh.x}px, ${sh.y}px) scale(${1 + 0.06 * kick(frame, hits, 4)})`,
    };
  }
  if (fx === "mask") {
    return {
      enter: { kind: "whip-left", frames: 10 },
      exit: { kind: "whip-left", frames: 8 },
      wrap: `scale(${1 + 0.035 * kick(frame, hits, 5)})`,
    };
  }
  if (fx === "phone") {
    const kk = kick(frame, hits, 5);
    const tilt = hits.filter((h) => h <= frame).length % 2 === 0 ? 1 : -1;
    return {
      enter: { kind: "whip-right", frames: 10 },
      exit: { kind: "whip-right", frames: 8 },
      wrap: `rotateZ(${tilt * kk * 1.2}deg) scale(${1 + 0.03 * kk})`,
    };
  }
  return { enter: { kind: "push", from: 0.9 }, exit: { kind: "push", from: 1.5, frames: 9 }, wrap: "" };
};
