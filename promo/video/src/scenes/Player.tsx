// Player - tap Amund's name on the head-to-head and his career opens: 7,480 games. On the
// 808 at track beat 93 the theme toggle flips the real site to light mode, then a swipe
// shows his season chart. The take starts half a beat before the cut, so the tap is the cut.

import { useVideoConfig } from "remotion";
import { FootageScene } from "../components/FootageScene";
import { eventFrame, type Take } from "../components/Footage";
import { BASS_HITS, FPS, SCENES } from "../timing";
import take from "../../public/takes/player.json";

const scene = SCENES.player;
const t = take as Take;
// The take was tapped on an even 124 BPM grid, but the track drifts a little here, so the take
// is placed by its main event instead: the theme toggle lands on the 808 at track beat 93
// (the first bass hit 90-120 frames into the scene). The tap on the name then falls in the
// scene's first frames.
const LIGHT_MS = t.events.find((e) => e.label === "light mode")!.t;
const LIGHT_HIT = BASS_HITS.find((h) => h - scene.start >= 90 && h - scene.start <= 120)!;
const SKIP = Math.max(0, LIGHT_MS / 1000 - (LIGHT_HIT - scene.start) / FPS);
// The "7,480 games" figure on the career page, in canvas px (CSS 60, 272 at 1080 / 390).
const GAMES = { x: 166, y: 753 };

export const Player: React.FC = () => {
  const { fps } = useVideoConfig();
  const light = eventFrame(t, "light mode", -Math.round(SKIP * fps), fps);
  return (
    <FootageScene
      scene={scene}
      src="takes/player.mp4"
      take={t}
      skip={SKIP}
      // The camera leans in on "7,480 games" while the page settles, then snaps back on the
      // 808 that flips the site to light mode.
      origin={`${GAMES.x}px ${GAMES.y}px`}
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: light - 2, scale: 1.32, ease: "even" },
        { frame: light + 8, scale: 1.0, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.05 },
      ]}
    />
  );
};
