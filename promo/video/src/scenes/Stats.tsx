// Stats - down the real head-to-head: from the scoreboard to how the lead has moved, then the
// tale of the tape. It opens on the view the search ends on, and the take's swipes start on
// the 808s at track beats 79 and 83.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { SCENES } from "../timing";
import take from "../../public/takes/stats.json";

const scene = SCENES.stats;

export const Stats: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/stats.mp4"
    take={take as Take}
    camera={[
      { frame: 0, scale: 1.12 },
      { frame: scene.duration, scale: 1.22 },
    ]}
  />
);
