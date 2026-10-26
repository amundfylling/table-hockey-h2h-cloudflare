// Root - registers the master composition and one debug composition per scene.

import { Composition } from "remotion";
import { FX } from "./fx";
import { loadSiteFonts } from "./load-fonts";
import { Master } from "./Master";
import { Hook } from "./scenes/Hook";
import { HookStencil } from "./scenes/HookStencil";
import { EndCard } from "./scenes/EndCard";
import { Career } from "./scenes/Career";
import { Filters } from "./scenes/Filters";
import { Games } from "./scenes/Games";
import { Home } from "./scenes/Home";
import { Light } from "./scenes/Light";
import { Share } from "./scenes/Share";
import { Tape } from "./scenes/Tape";
import { Search } from "./scenes/Search";
import { Stats } from "./scenes/Stats";
import { canvas } from "./theme";
import { FPS, SCENES, TOTAL_FRAMES } from "./timing";

// The site's own families (DESIGN.md), self-hosted.
loadSiteFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Master"
      component={Master}
      defaultProps={{ sfx: true, fx: "mix" }}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    {/* The transition styles under review (fx.ts); the default Master is the shipped look. */}
    {FX.filter((f) => f !== "v2").map((f) => (
      <Composition
        key={f}
        id={`Master-${f}`}
        component={Master}
        defaultProps={{ sfx: true, fx: f }}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={canvas.width}
        height={canvas.height}
      />
    ))}
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
    <Composition
      id="Scene-Stats"
      component={Stats}
      durationInFrames={SCENES.stats.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Filters"
      component={Filters}
      durationInFrames={SCENES.filters.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Tape"
      component={Tape}
      durationInFrames={SCENES.tape.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Games"
      component={Games}
      durationInFrames={SCENES.games.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Share"
      component={Share}
      durationInFrames={SCENES.share.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Career"
      component={Career}
      durationInFrames={SCENES.career.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Light"
      component={Light}
      durationInFrames={SCENES.light.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-Home"
      component={Home}
      durationInFrames={SCENES.home.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Scene-End"
      component={EndCard}
      durationInFrames={SCENES.end.duration}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="Debug-HookStencil"
      component={HookStencil}
      durationInFrames={1}
      fps={FPS}
      width={canvas.width}
      height={canvas.height}
    />
  </>
);
