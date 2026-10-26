// Games - the list of every game: the latest one opens on the strong hit that ends the first
// drop, closes, and the sort flips to oldest first.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/games.json";

const scene = SCENES.games;

export const Games: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/games.mp4"
    take={take as Take}
    anchors={[{ label: "details", frame: hitNear(beatFrame(64)) - scene.start }]}
    origin="50% 40%"
    camera={[
      { frame: 0, scale: 1.0 },
      { frame: scene.duration, scale: 1.1 },
    ]}
  />
);
