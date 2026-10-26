// FootageScene - a scene that is one recorded take on the phone's screen, with the transition style's
// entrance, exit and bass kicks (fx.ts). Scenes with a bespoke entrance (Search) build their own.

import { AbsoluteFill, useCurrentFrame } from "remotion";
import { cutStyle, useFx } from "../fx";
import type { Scene } from "../scene-frames";
import { colors } from "../theme";
import { bassHitsIn } from "../timing";
import { Footage, type Take } from "./Footage";
import { Phone, SCREEN_PX } from "./Phone";
import { Stage, type CameraKey } from "./Stage";

export const FootageScene: React.FC<{
  scene: Scene;
  src: string;
  take: Take;
  /** Seconds into the take on the scene's first frame. */
  skip?: number;
  camera?: CameraKey[];
  origin?: string;
  /** Scene-local frame from which the site is in light mode (the status bar follows it). */
  lightFrom?: number;
  children?: React.ReactNode;
}> = ({ scene, src, take, skip = 0, camera, origin = "50% 50%", lightFrom = Infinity, children }) => {
  const fx = useFx();
  const frame = useCurrentFrame();
  const { enter, exit, wrap } = cutStyle(fx, frame, bassHitsIn(scene));
  return (
    <Stage duration={scene.duration} background={colors.background} enter={enter} exit={exit} camera={camera} origin={origin}>
      <AbsoluteFill style={{ transform: wrap || undefined, transformOrigin: origin }}>
        <Phone light={frame >= lightFrom}>
          <Footage src={src} take={take} skip={skip} width={SCREEN_PX} />
        </Phone>
      </AbsoluteFill>
      {children}
    </Stage>
  );
};
