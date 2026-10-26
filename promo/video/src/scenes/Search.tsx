// Search - the real site: tap the player field, type "Amund", pick him, then the
// opponent, and the head-to-head opens with its own count-up to 413-342.
// The take's t=0 is the scene's first frame (beat 9), and the take taps on whole beats,
// so the last tap lands on beat 15, the drop.

import { useVideoConfig } from "remotion";
import { Footage, eventFrame, type Take } from "../components/Footage";
import { Stage } from "../components/Stage";
import { colors } from "../theme";
import { SCENES } from "../timing";
import take from "../../public/takes/search.json";

const scene = SCENES.search;

export const Search: React.FC = () => {
  const { fps, width } = useVideoConfig();
  const k = width / 390; // px per CSS px of the site
  const t = take as Take;
  const pickA = eventFrame(t, "pick Amund", 0, fps);
  const pickB = eventFrame(t, "pick Andreas", 0, fps);
  // The scoreboard sits about 150 CSS px down the page once the matchup opens.
  const scoreY = 150 * k;
  return (
    <Stage
      duration={scene.duration}
      background={colors.background}
      enter={{ kind: "push", from: 0.9 }}
      exit={{ kind: "push", from: 1.5, frames: 9 }}
      origin={`50% ${scoreY}px`}
      // The footage fills the width, so any zoom crops the page's sides: past about 1.06
      // the player names on the scoreboard lose their first letters.
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: pickA, scale: 1.025, ease: "soft" },
        { frame: pickB, scale: 1.0, ease: "rampIn" },
        { frame: pickB + 14, scale: 1.05, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.065 },
      ]}
    >
      <Footage src="takes/search.mp4" take={t} />
    </Stage>
  );
};
