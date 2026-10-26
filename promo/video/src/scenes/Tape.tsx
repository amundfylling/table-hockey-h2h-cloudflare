// Tape - further down the head-to-head: the scoreline grid, season by season, and every
// tournament they have met in. The swipe to the seasons starts on the 808 at track beat 107.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/tape.json";

const scene = SCENES.tape;

export const Tape: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/tape.mp4"
    take={take as Take}
    anchors={[{ label: "to seasons", frame: hitNear(beatFrame(51)) - scene.start }]}
    camera={[
      { frame: 0, scale: 1.1 },
      { frame: scene.duration, scale: 1.02 },
    ]}
  />
);
