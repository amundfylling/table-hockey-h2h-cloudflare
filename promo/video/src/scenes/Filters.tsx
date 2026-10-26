// Filters - on the real head-to-head: the Playoff stage (tapped on the cut), its series view,
// then the advanced filters, where the overtime toggle is tapped on the 808 at track beat 94.5.
// The take is placed by those two taps (placeTake), so both land on their hits.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { SCENES, halfBeatFrame, hitNear } from "../timing";
import take from "../../public/takes/filters.json";

const scene = SCENES.filters;

export const Filters: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/filters.mp4"
    take={take as Take}
    anchors={[
      { label: "playoff", frame: 0 },
      { label: "overtime", frame: hitNear(halfBeatFrame(38)) - scene.start },
    ]}
    origin="50% 30%"
    camera={[
      { frame: 0, scale: 1.04 },
      { frame: scene.duration, scale: 1.12 },
    ]}
  />
);
