// Search - the real site: tap the player field, type "Amund", pick him, then the
// opponent, and the head-to-head opens with its own count-up to 413-342.
// The take's t=0 is the scene's first frame (the drop), and the take taps on the beat grid,
// so the last tap lands on the 808 at half beat 14 and the scoreboard counts up on it.
// The entrance, the bass kicks and the exit follow the transition style (fx.ts).

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Footage, eventFrame, type Take } from "../components/Footage";
import { Phone, SCREEN_PX, siteToCanvas } from "../components/Phone";
import { Stage } from "../components/Stage";
import { easings } from "../easings";
import { cutStyle, kick, useFx } from "../fx";
import { colors } from "../theme";
import { SCENES, bassHitsIn } from "../timing";
import take from "../../public/takes/search.json";
import { HookCard, MASK_CAMERA } from "./Hook";

const scene = SCENES.search;
const HITS = bassHitsIn(scene);

// The centre of the "?" dot on the hook's last frame (measured from Debug-HookStencil at
// camera scale 1, then moved by the hook's final camera: 1.04 about 30% 55%).
const DOT = { x: 814, y: 1319 };
const DIVE_FRAMES = 12;
const PHONE_FRAMES = 18;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The hook's words as a window onto the site: on the drop the site shows only through the
 * letters, the camera leans toward the "?", and an iris opens from its dot to the full frame.
 * The stencil never scales past STENCIL_MAX: a layer blown up 20x and more drew wrong in the
 * render browser (glyphs came out black), so the iris does the rest of the reveal.
 */
const STENCIL_MAX = 2.6;
const IRIS_START = 3;

const DiveThroughType: React.FC<{ footage: React.ReactNode }> = ({ footage }) => {
  const frame = useCurrentFrame();
  if (frame >= DIVE_FRAMES) return null;
  const p = interpolate(frame, [0, DIVE_FRAMES], [0, 1], clamp);
  const s = Math.exp(Math.log(STENCIL_MAX) * easings.rampIn(p));
  const q = easings.rampIn(interpolate(frame, [IRIS_START, DIVE_FRAMES], [0, 1], clamp));
  // The dot's radius is 24 px on the hook; the iris starts there and runs past the far corner.
  const r = 24 * s + q * 2300;
  return (
    <>
      <AbsoluteFill style={{ mixBlendMode: "multiply" }}>
        <AbsoluteFill
          style={{ background: "#000000", transform: `scale(${s})`, transformOrigin: `${DOT.x}px ${DOT.y}px` }}
        >
          <AbsoluteFill style={{ transform: `scale(${MASK_CAMERA.scale})`, transformOrigin: MASK_CAMERA.origin }}>
            <HookCard frozen="stencil" />
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${DOT.x}px ${DOT.y}px` }}>
        <AbsoluteFill style={{ transform: `scale(${MASK_CAMERA.scale})`, transformOrigin: MASK_CAMERA.origin }}>
          <HookCard frozen="outline" />
        </AbsoluteFill>
      </AbsoluteFill>
      {frame >= IRIS_START && (
        <AbsoluteFill style={{ clipPath: `circle(${r.toFixed(1)}px at ${DOT.x}px ${DOT.y}px)` }}>{footage}</AbsoluteFill>
      )}
    </>
  );
};

export const Search: React.FC = () => {
  const fx = useFx();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = take as Take;
  const pickA = eventFrame(t, "pick Amund", 0, fps);
  const pickB = eventFrame(t, "pick Andreas", 0, fps);
  // The scoreboard sits about 200 CSS px down the page once the matchup opens.
  const scoreY = siteToCanvas(201, 200).y;

  // Later cuts follow the style; the entrance on the drop is this scene's own.
  const style = cutStyle(fx, frame, HITS);
  let { enter, wrap } = style;
  const { exit } = style;
  if (fx === "mask" || fx === "mix") {
    enter = { kind: "cut" };
    const late = HITS.filter((h) => h > DIVE_FRAMES);
    wrap = cutStyle(fx, frame, late).wrap;
  } else if (fx === "phone") {
    enter = { kind: "cut" };
    const p = easings.slowInLand(interpolate(frame, [0, PHONE_FRAMES], [0, 1], clamp));
    const kk = kick(frame, HITS.filter((h) => h > PHONE_FRAMES), 5);
    const tilt = HITS.filter((h) => h <= frame).length % 2 === 0 ? 1 : -1;
    wrap =
      `perspective(2400px) rotateY(${(1 - p) * 34}deg) rotateX(${(1 - p) * 16}deg) ` +
      `rotateZ(${(1 - p) * -6 + tilt * kk * 1.2}deg) scale(${0.58 + 0.42 * p + 0.03 * kk})`;
  }

  return (
    <Stage
      duration={scene.duration}
      background={colors.background}
      enter={enter}
      exit={exit}
      origin={`50% ${scoreY}px`}
      // The whole phone while the names are typed, then a push onto the screen as the
      // scoreboard counts up on the 808.
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: pickA, scale: 1.06, ease: "soft" },
        { frame: pickB, scale: 1.04, ease: "rampIn" },
        { frame: pickB + 14, scale: 1.32, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.4 },
      ]}
    >
      <AbsoluteFill style={{ transform: wrap || undefined, transformOrigin: `50% ${scoreY}px` }}>
        <Phone>
          <Footage src="takes/search.mp4" take={t} width={SCREEN_PX} />
        </Phone>
      </AbsoluteFill>
      {(fx === "mask" || fx === "mix") && <DiveThroughType
          footage={
            <AbsoluteFill style={{ background: colors.background }}>
              <Phone>
                <Footage src="takes/search.mp4" take={t} width={SCREEN_PX} />
              </Phone>
            </AbsoluteFill>
          }
        />}
    </Stage>
  );
};
