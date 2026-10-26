// Player - tap Amund's name on the head-to-head and his career opens: 7,480 games. On the
// 808 at track beat 93 the theme toggle flips the real site to light mode, then a swipe
// shows his season chart. The tap on his name is the cut.

import { FootageScene } from "../components/FootageScene";
import { siteToCanvas } from "../components/Phone";
import type { Take } from "../components/Footage";
import { BASS_HITS, FPS, SCENES } from "../timing";
import take from "../../public/takes/player.json";

const scene = SCENES.player;
const t = take as Take;
// The take was tapped on an even 124 BPM grid, but the track drifts a little here, so the take
// is placed by its two taps: the tap on the name lands on the cut (an 808), and the take runs a
// little slower so the theme toggle lands on the 808 at track beat 93 (the first bass hit
// 90-120 frames into the scene).
const OPEN_MS = t.events.find((e) => e.label === "open Amund")!.t;
const LIGHT_MS = t.events.find((e) => e.label === "light mode")!.t;
const LIGHT_HIT = BASS_HITS.find((h) => h - scene.start >= 90 && h - scene.start <= 120)! - scene.start;
const RATE = ((LIGHT_MS - OPEN_MS) / 1000) * FPS / LIGHT_HIT;
const SKIP = OPEN_MS / 1000;
// The "7,480 games" figure on the career page.
const GAMES = siteToCanvas(60, 272);

export const Player: React.FC = () => {
  const light = LIGHT_HIT;
  return (
    <FootageScene
      scene={scene}
      src="takes/player.mp4"
      take={t}
      skip={SKIP}
      rate={RATE}
      // The camera leans in on "7,480 games" while the page settles, then snaps back on the
      // 808 that flips the site to light mode.
      origin={`${GAMES.x}px ${GAMES.y}px`}
      lightFrom={light + 1}
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: light - 2, scale: 1.45, ease: "even" },
        { frame: light + 8, scale: 1.0, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.05 },
      ]}
    />
  );
};
