// Home - the home page in light mode: the most-played rivalry, then the top-ranked rivalries;
// placed by the swipe to the rivalries, which starts on an 808.

import { FootageScene } from "../components/FootageScene";
import type { Take } from "../components/Footage";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/home.json";

const scene = SCENES.home;

export const Home: React.FC = () => (
  <FootageScene
    scene={scene}
    src="takes/home.mp4"
    take={take as Take}
    lightFrom={0}
    anchors={[{ label: "to rivalries", frame: hitNear(beatFrame(118)) - scene.start }]}
    camera={[
      { frame: 0, scale: 1.0 },
      { frame: scene.duration, scale: 1.08 },
    ]}
  />
);
