// Master - the 9:16 film: the soundtrack plus one <Sequence> per scene.
//
// Every `from` and `durationInFrames` comes from SCENES in timing.ts. Add a
// scene by adding it to the scene list there, importing it here, and giving it
// a <Sequence> below and a debug composition in Root.tsx.

import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Captions, type CaptionLine } from "./components/Caption";
import { SOUNDS, Sfx } from "./components/Sfx";
import { Hook } from "./scenes/Hook";
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
import { type Fx, FxContext, slams } from "./fx";
import { colors } from "./theme";
import { MUSIC_VOLUME, beatFrame, halfBeatFrame, hitNear, AUDIO_TRIM, SCENES, SOUNDTRACK, TOTAL_FRAMES } from "./timing";

// What the demo is showing, one short line per step. Each starts on a cut or on the tap or
// swipe it describes, all of which sit on bass hits (hitNear snaps a beat to its hit).
const at = (frame: number) => hitNear(frame);
const CAPTIONS: CaptionLine[] = [
  { at: SCENES.search.start, text: "Search any two players" },
  { at: at(halfBeatFrame(14)), text: "Get their full head-to-head" },
  { at: SCENES.stats.start, text: "Follow how the lead moved" },
  { at: at(halfBeatFrame(26)), text: "Compare them stat by stat" },
  { at: SCENES.filters.start, text: "Zoom in on playoff series" },
  { at: at(beatFrame(37)), text: "Filter by year, level or format" },
  { at: SCENES.tape.start, text: "See every scoreline" },
  { at: at(beatFrame(51)), text: "Season by season" },
  { at: at(beatFrame(58)), text: "Tournament by tournament" },
  { at: SCENES.games.start, text: "Every game they've played" },
  { at: at(beatFrame(64)), text: "Open one for the details" },
  { at: SCENES.share.start, text: "Share a matchup as an image" },
  { at: SCENES.career.start, text: "Tap a name for their career" },
  { at: at(halfBeatFrame(90)), text: "Win rate, season by season" },
  { at: at(beatFrame(96)), text: "Map every rival" },
  { at: at(beatFrame(99)), text: "Rank all their opponents" },
  { at: SCENES.light.start, text: "Light or dark, your call" },
  { at: SCENES.home.start, text: "Browse the biggest rivalries" },
  { at: at(beatFrame(118)), text: "Ranked by the world's best" },
];

const FADE_OUT_FRAMES = 18; // 0.6 s at 30 fps: reads as an outro without wasting the last beat

// Sound effects, optional (references/sound-effects.md): one row per event,
// four to eight in a film. `at` is the frame the visual uses, from timing.ts;
// `sound` is one of the library's (SOUNDS), or `src` a file in public/sfx with
// the lead measured by scripts/measure-lead.py. <Sfx> starts each file early
// by its lead so the loudest point lands on the event. The `sfx` prop turns
// the layer off; Root.tsx registers that as Master-NoSfx, so the user can
// compare the two renders by ear. Most feeds play muted: the film has to
// work with CUES empty.
type Cue = { at: number; volume?: number } & ({ sound: keyof typeof SOUNDS } | { src: string; lead: number });
const CUES: Cue[] = [
  // { at: SCENES.example.start, sound: "whoosh", volume: 0.35 },
  // { at: SCENES.example.start + 20, src: "sfx/thump.wav", lead: 0, volume: 0.5 },
];

/** The sound effects, one layer both masters share (MasterVertical renders it too). */
export const SoundLayer: React.FC<{ sfx?: boolean }> = ({ sfx = true }) =>
  !sfx ? null : (
    <>
      {CUES.map((c, i) =>
        "sound" in c ? (
          <Sfx key={i} at={c.at} sound={c.sound} volume={c.volume} />
        ) : (
          <Sfx key={i} at={c.at} src={staticFile(c.src)} lead={c.lead} volume={c.volume} />
        ),
      )}
    </>
  );

/** A white flash that fades over a few frames, for the slam style's cuts. */
const Flash: React.FC<{ at: number[] }> = ({ at }) => {
  const frame = useCurrentFrame();
  const o = Math.max(
    0,
    ...at.map((a) =>
      frame < a - 1 || frame > a + 5
        ? 0
        : interpolate(frame, [a - 1, a, a + 5], [0.35, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    ),
  );
  return o > 0.01 ? <AbsoluteFill style={{ background: "#FFFFFF", opacity: o }} /> : null;
};

export const Master: React.FC<{ sfx?: boolean; fx?: Fx }> = ({ sfx = true, fx = "v2" }) => {
  const frame = useCurrentFrame();
  const volume = interpolate(
    frame,
    [TOTAL_FRAMES - FADE_OUT_FRAMES, TOTAL_FRAMES],
    [MUSIC_VOLUME, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <FxContext.Provider value={fx}>
    <AbsoluteFill style={{ background: colors.background }}>
      {SOUNDTRACK && (
        <Audio src={staticFile(SOUNDTRACK)} trimBefore={AUDIO_TRIM} volume={volume} />
      )}
      <SoundLayer sfx={sfx} />

      <Sequence from={SCENES.hook.start} durationInFrames={SCENES.hook.duration}>
        <Hook />
      </Sequence>
      <Sequence from={SCENES.search.start} durationInFrames={SCENES.search.duration}>
        <Search />
      </Sequence>
      <Sequence from={SCENES.stats.start} durationInFrames={SCENES.stats.duration}>
        <Stats />
      </Sequence>
      {(
        [
          ["filters", Filters],
          ["tape", Tape],
          ["games", Games],
          ["share", Share],
          ["career", Career],
          ["light", Light],
          ["home", Home],
        ] as const
      ).map(([name, Scene]) => (
        <Sequence key={name} from={SCENES[name].start} durationInFrames={SCENES[name].duration}>
          <Scene />
        </Sequence>
      ))}
      <Sequence from={SCENES.end.start} durationInFrames={SCENES.end.duration}>
        <EndCard />
      </Sequence>
      <Captions lines={CAPTIONS} until={SCENES.end.start} />
      {slams(fx) && (
        <Flash
          at={[
            ...(fx === "slam" ? [SCENES.search.start] : []),
            SCENES.stats.start,
            SCENES.filters.start,
            SCENES.tape.start,
            SCENES.games.start,
            SCENES.share.start,
            SCENES.career.start,
            SCENES.light.start,
            SCENES.home.start,
            SCENES.end.start,
          ]}
        />
      )}
    </AbsoluteFill>
    </FxContext.Provider>
  );
};
