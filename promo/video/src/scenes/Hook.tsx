// Hook - the question the rest of the film answers with the real site.
// One word per backbeat: "Who's" on the cut, "really" and "better?" on the next two,
// then a hold before the push into the search.

import { AbsoluteFill, Img, staticFile } from "remotion";
import { Stage } from "../components/Stage";
import { Title } from "../components/Title";
import { colors, fonts } from "../theme";
import { SCENES, backbeatFrame } from "../timing";

const scene = SCENES.hook;
const REALLY = backbeatFrame(0) - scene.start;
const BETTER = backbeatFrame(1) - scene.start;

const word: React.CSSProperties = {
  fontFamily: fonts.display,
  fontWeight: 800,
  fontSize: 220,
  lineHeight: 1.0,
  letterSpacing: "-0.03em",
  color: colors.ink,
};

export const Hook: React.FC = () => (
  <Stage
    duration={scene.duration}
    background={colors.background}
    camera={[
      { frame: 0, scale: 1 },
      { frame: scene.duration, scale: 1.07 },
    ]}
    origin="30% 55%"
    exit={{ kind: "push", from: 1.6, frames: 9 }}
  >
    <AbsoluteFill style={{ padding: "0 84px", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 80 }}>
        <Img src={staticFile("logo-mark.svg")} style={{ width: 64, height: 64 }} />
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 44, color: colors.ink }}>
          Table Hockey H2H
        </div>
      </div>
      <Title text="Who's" style={word} />
      <Title text="really" enterAt={REALLY} rise={10} style={{ ...word, color: colors.teal }} />
      <Title text="better?" enterAt={BETTER} rise={10} style={{ ...word, color: colors.accent }} />
    </AbsoluteFill>
  </Stage>
);
