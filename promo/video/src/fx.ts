// fx.ts - the transition style switch and the bass-driven camera helpers.
//
// Every candidate look is a value of Fx, passed to the master as a prop, so a veto is one
// token and the earlier look stays reachable. "v2" is the cut the owner saw at checkpoint 2.
//   slam   impact: the drop slams the site in with blur and a flash, 808s kick the camera
//   mask   the site is seen through the hook's letters, and the camera dives through the "?"
//   phone  the site arrives as a phone screen swinging flat in 3D, 808s nudge it

import { createContext, useContext } from "react";
import { random } from "remotion";

export const FX = ["v2", "slam", "mask", "phone"] as const;
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
