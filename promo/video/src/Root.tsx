// Root - registers the master composition and one debug composition per scene.

import { Composition } from "remotion";
import { loadSiteFonts } from "./load-fonts";
import { Master } from "./Master";
import { Hook } from "./scenes/Hook";
import { Search } from "./scenes/Search";
import { canvas } from "./theme";
import { FPS, SCENES, TOTAL_FRAMES } from "./timing";

// The site's own families (DESIGN.md), self-hosted.
loadSiteFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Master"
      component={Master}
      defaultProps={{ sfx: true }}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    {/* The same film with the music only: render both and the sound effects
        can be judged by ear (references/sound-effects.md). */}
    <Composition
      id="Master-NoSfx"
      component={Master}
      defaultProps={{ sfx: false }}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />

    {/* One debug composition per scene, so a scene renders alone in seconds.
        IDs take letters, digits and hyphens only: an underscore is rejected at render time. */}
    <Composition
      id="Scene-Hook"
      component={Hook}
      durationInFrames={SCENES.hook.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Search"
      component={Search}
      durationInFrames={SCENES.search.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
  </>
);
