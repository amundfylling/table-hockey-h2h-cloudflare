// Hook - the question the rest of the film answers with the real site.
// It plays over the last bars of the build: "Who's" on the first frame, "really" and "better?"
// on the two bass hits before the break, then the near-silent break gathers into the drop.
// How it leaves depends on the transition style (fx.ts).

import { AbsoluteFill, Img, staticFile } from "remotion";
import { Stage, type CameraKey, type Move } from "../components/Stage";
import { Title } from "../components/Title";
import { useFx } from "../fx";
import { colors, fonts } from "../theme";
import { SCENES, beatFrame } from "../timing";

const scene = SCENES.hook;
const REALLY = beatFrame(3) - scene.start;
const BETTER = beatFrame(4) - scene.start;

/** The mask style keeps the camera nearly still, so Search can redraw this frame exactly. */
export const MASK_CAMERA = { scale: 1.04, origin: "30% 55%" } as const;

const word: React.CSSProperties = {
  fontFamily: fonts.display,
  fontWeight: 800,
  fontSize: 220,
  lineHeight: 1.0,
  letterSpacing: "-0.03em",
  color: colors.ink,
};

/**
 * The card itself. `frozen` draws its last frame with no logo for the mask transition:
 * "stencil" paints every word white (the window), "outline" strokes each word in its colour
 * with no fill (so the letters stay legible while the dark site shows through them).
 */
export const HookCard: React.FC<{ frozen?: "stencil" | "outline" }> = ({ frozen }) => {
  const tint = (c: string): React.CSSProperties =>
    frozen === "stencil"
      ? { color: "#FFFFFF" }
      : frozen === "outline"
        ? { color: "transparent", WebkitTextStroke: `5px ${c}` }
        : { color: c };
  return (
    <AbsoluteFill style={{ padding: "0 84px", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          marginBottom: 80,
          visibility: frozen ? "hidden" : "visible",
        }}
      >
        <Img src={staticFile("logo-mark.svg")} style={{ width: 64, height: 64 }} />
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 44, color: colors.ink }}>
          Table Hockey H2H
        </div>
      </div>
      <Title text="Who's" exit={frozen ? "none" : "auto"} style={{ ...word, ...tint(colors.ink) }} />
      <Title
        text="really"
        enterAt={frozen ? undefined : REALLY}
        rise={10}
        exit={frozen ? "none" : "auto"}
        style={{ ...word, ...tint(colors.teal) }}
      />
      <Title
        text="better?"
        enterAt={frozen ? undefined : BETTER}
        rise={10}
        exit={frozen ? "none" : "auto"}
        style={{ ...word, ...tint(colors.accent) }}
      />
    </AbsoluteFill>
  );
};

export const Hook: React.FC = () => {
  const fx = useFx();
  let camera: CameraKey[] = [
    { frame: 0, scale: 1 },
    { frame: BETTER, scale: 1.02 },
    { frame: scene.duration, scale: 1.12, ease: "rampIn" },
  ];
  let origin = "30% 55%";
  let exit: Move = { kind: "push", from: 1.6, frames: 9 };
  if (fx === "slam") {
    // The break pulls the camera in hard, and the exit punches through the words.
    exit = { kind: "push", from: 2.6, frames: 7 };
  } else if (fx === "mask") {
    camera = [
      { frame: 0, scale: 1 },
      { frame: scene.duration, scale: MASK_CAMERA.scale },
    ];
    origin = MASK_CAMERA.origin;
    exit = { kind: "cut" };
  } else if (fx === "phone") {
    exit = { kind: "whip-left", frames: 8 };
  }
  return (
    <Stage duration={scene.duration} background={colors.background} camera={camera} origin={origin} exit={exit}>
      <HookCard />
    </Stage>
  );
};
