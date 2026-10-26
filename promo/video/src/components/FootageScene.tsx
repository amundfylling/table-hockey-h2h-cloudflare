// FootageScene - a scene that is one recorded take on the phone's screen, with the transition style's
// entrance, exit and bass kicks (fx.ts). Scenes with a bespoke entrance (Search) build their own.

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cutStyle, useFx } from "../fx";
import type { Scene } from "../scene-frames";
import { colors } from "../theme";
import { bassHitsIn } from "../timing";
import { Footage, placeTake, type Take } from "./Footage";
import { Phone, SCREEN_PX } from "./Phone";
import { Stage, type CameraKey } from "./Stage";

export const FootageScene: React.FC<{
  scene: Scene;
  src: string;
  take: Take;
  /** Seconds into the take on the scene's first frame. */
  skip?: number;
  rate?: number;
  /** Place the take by its events instead of skip/rate (see placeTake). Scene-local frames. */
  anchors?: { label: string; frame: number }[];
  camera?: CameraKey[];
  origin?: string;
  /** Scene-local frame from which the site is in light mode (the status bar follows it). */
  lightFrom?: number;
  /** Drawn on the phone's screen above the footage (a share sheet, say), in screen px. */
  screen?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ scene, src, take, skip: skip0 = 0, rate: rate0 = 1, anchors, camera, origin = "50% 50%", lightFrom = Infinity, screen, children }) => {
  const fx = useFx();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { skip, rate } = anchors ? placeTake(take, anchors, fps) : { skip: skip0, rate: rate0 };
  const { enter, exit, wrap } = cutStyle(fx, frame, bassHitsIn(scene));
  return (
    <Stage duration={scene.duration} background={colors.background} enter={enter} exit={exit} camera={camera} origin={origin}>
      <AbsoluteFill style={{ transform: wrap || undefined, transformOrigin: origin }}>
        <Phone light={frame >= lightFrom}>
          <Footage src={src} take={take} skip={skip} rate={rate} width={SCREEN_PX} />
          {screen}
        </Phone>
      </AbsoluteFill>
      {children}
    </Stage>
  );
};
