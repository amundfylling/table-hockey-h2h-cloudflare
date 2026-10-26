// Light - on the second drop: Amund's career in dark mode, and the theme toggle flips the real
// site to light mode on the 808 at track beat 163. Uses the player take, placed by that tap.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { siteToCanvas } from "../components/Phone";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/player.json";

const scene = SCENES.light;
const t = take as Take;
const LIGHT = hitNear(beatFrame(107)) - scene.start;
const ANCHORS = [{ label: "light mode", frame: LIGHT }];
// The theme toggle in the site's top bar.
const TOGGLE = siteToCanvas(330, 26);

export const Light: React.FC = () => {
  return (
    <FootageScene
      scene={scene}
      src="takes/player.mp4"
      take={t}
      anchors={ANCHORS}
      // Toward the toggle in the top bar, then back as the page flips.
      origin={`${TOGGLE.x}px ${TOGGLE.y}px`}
      lightFrom={LIGHT + 1}
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: LIGHT - 2, scale: 1.3, ease: "even" },
        { frame: LIGHT + 10, scale: 1.0, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.03 },
      ]}
    />
  );
};
