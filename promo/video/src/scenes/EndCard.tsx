// EndCard - the answer to the hook's question: go and find out, at the site's address.
// "Find out." is on the cut frame; the address rises on the next big 808.

import { AbsoluteFill, Img, staticFile } from "remotion";
import { Stage } from "../components/Stage";
import { Title } from "../components/Title";
import { useFx } from "../fx";
import { colors, fonts } from "../theme";
import { SCENES, beatFrame } from "../timing";

const scene = SCENES.end;
// Track beat 104 (timeline beat 48) is the 808 after the cut.
const URL_IN = beatFrame(48) - scene.start;

export const EndCard: React.FC = () => {
  const fx = useFx();
  const enter =
    fx === "slam" || fx === "mix"
      ? ({ kind: "pull-back", from: 1.45, blur: 16, frames: 10 } as const)
      : fx === "v2"
        ? ({ kind: "push", from: 0.9 } as const)
        : ({ kind: fx === "phone" ? "whip-right" : "whip-left", frames: 10 } as const);
  return (
    <Stage
      duration={scene.duration}
      background={colors.background}
      enter={enter}
      camera={[
        { frame: 0, scale: 1 },
        { frame: scene.duration, scale: 1.05 },
      ]}
      origin="30% 50%"
    >
      <AbsoluteFill style={{ padding: "0 84px", justifyContent: "center" }}>
        <Img src={staticFile("logo-mark.svg")} style={{ width: 150, height: 150, marginBottom: 70 }} />
        <Title
          text={"Find\nout."}
          style={{
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 250,
            lineHeight: 0.98,
            letterSpacing: "-0.03em",
            color: colors.ink,
          }}
        />
        <Title
          text="table-hockey-h2h.pages.dev"
          enterAt={URL_IN}
          rise={10}
          style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 58, color: colors.teal, marginTop: 60 }}
        />
      </AbsoluteFill>
    </Stage>
  );
};
