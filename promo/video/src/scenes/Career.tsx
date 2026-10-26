// Career - tap Amund's name on the head-to-head (on the cut) and his career opens; then down
// the page: win rate by season, the rival map, and his opponents, where the minimum-games slider
// is dragged. Placed by the tap and the swipe to the rival map, which both land on bass hits;
// the other swipes then fall on hits too (checked in docs/video/notes.md).

import { FootageScene } from "../components/FootageScene";
import { siteToCanvas } from "../components/Phone";
import type { Take } from "../components/Footage";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/career.json";

const scene = SCENES.career;
const GAMES = siteToCanvas(60, 272);

export const Career: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/career.mp4"
    take={take as Take}
    anchors={[
      { label: "open Amund", frame: 0 },
      { label: "to rival map", frame: hitNear(beatFrame(96)) - scene.start },
    ]}
    origin={`${GAMES.x}px ${GAMES.y}px`}
    camera={[
      { frame: 0, scale: 1.0 },
      { frame: 40, scale: 1.25, ease: "slowInLand" },
      { frame: 56, scale: 1.25 },
      { frame: 66, scale: 1.0, ease: "slowInLand" },
      { frame: scene.duration, scale: 1.04 },
    ]}
  />
);
