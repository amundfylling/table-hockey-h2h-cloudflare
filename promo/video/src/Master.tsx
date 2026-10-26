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
import { Player } from "./scenes/Player";
import { Search } from "./scenes/Search";
import { Stats } from "./scenes/Stats";
import { type Fx, FxContext, slams } from "./fx";
import { colors } from "./theme";
import { BASS_HITS, MUSIC_VOLUME, AUDIO_TRIM, SCENES, SOUNDTRACK, TOTAL_FRAMES } from "./timing";

/** The first bass hit at or after a frame (so each caption lands with the music). */
const hitFrom = (frame: number): number => BASS_HITS.find((h) => h >= frame - 1) ?? frame;

// What the demo is showing, one short line per step. Each starts on a cut or on the tap it
// describes, both of which sit on bass hits.
const CAPTIONS: CaptionLine[] = [
  { at: SCENES.search.start, text: "Search any two players" },
  { at: hitFrom(SCENES.search.start + 90), text: "Get their full head-to-head" },
  { at: SCENES.stats.start, text: "Follow how the lead moved" },
  { at: hitFrom(SCENES.stats.start + 70), text: "Compare them stat by stat" },
  { at: SCENES.player.start, text: "Tap a name for their career" },
  { at: hitFrom(SCENES.player.start + 90), text: "Light or dark, your call" },
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
      <Sequence from={SCENES.player.start} durationInFrames={SCENES.player.duration}>
        <Player />
      </Sequence>
      <Sequence from={SCENES.end.start} durationInFrames={SCENES.end.duration}>
        <EndCard />
      </Sequence>
      <Captions lines={CAPTIONS} until={SCENES.end.start} />
      {slams(fx) && (
        <Flash
          at={[
            ...(fx === "slam" ? [SCENES.search.start] : []),
            SCENES.stats.start,
            SCENES.player.start,
            SCENES.end.start,
          ]}
        />
      )}
    </AbsoluteFill>
    </FxContext.Provider>
  );
};
