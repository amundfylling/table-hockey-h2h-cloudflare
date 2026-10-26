// timing.ts - the film's clock. Every frame number in the film comes from here,
// and every number here comes from beats.json (written by scripts/detect-beats.py).
// Scenes are placed by beat index, so no frame is ever typed by hand and
// changing one index re-flows everything after it.

import { getRemotionEnvironment } from "remotion";
import bassHits from "../bass-hits.json";
import beats from "../beats.json";
import { nearestBeat, type Scene } from "./scene-frames";

export const FPS = beats.fps;

/** Soundtrack file name under public/. null while beats.json is still the scaffold's placeholder. */
export const SOUNDTRACK: string | null = beats.audio_file;

/**
 * Frames cut off the start of the soundtrack (to skip a long intro, say).
 * Master passes this to <Audio trimBefore>, and the beat grid below shifts by
 * the same amount, so the picture and the music cannot drift apart.
 */
export const AUDIO_TRIM = beats.beat_frames[56]; // 26.1 s: the last bars of the build before the break and the drop

/** The soundtrack's level in the master (and in test beds, so they sound the same). */
export const MUSIC_VOLUME = 0.6;

/**
 * true: the film is cut to the beat, and scene ends are written as beats.
 * false: the film is not beat-synced (the beat grid was rated "poor", or a
 * voiceover sets the pace). Scene ends are then written with atSeconds(), and
 * the brief has to say so, because the viewer will not get cuts on the music.
 */
export const BEAT_SYNCED = true;

/** Seconds to master frame. For films that are not beat-synced; never for an event that claims to be on a beat. */
export const atSeconds = (seconds: number): number => Math.round(seconds * FPS);

const onTimeline = (frames: number[]): number[] =>
  frames.map((f) => f - AUDIO_TRIM).filter((f) => f >= 0);

/** Master frames of every beat, of the backbeats (2 and 4), and of the downbeats (1 and 3). */
export const BEATS = onTimeline(beats.beat_frames);
export const BACKBEATS = onTimeline(beats.backbeat_frames);
export const DOWNBEATS = onTimeline(beats.downbeat_frames);

const pick = (frames: number[], n: number, kind: string): number => {
  const frame = frames[n];
  if (frame === undefined) {
    throw new Error(`[timing] ${kind} ${n} does not exist: the track has ${frames.length} of them.`);
  }
  return frame;
};

/** Master frame of beat n, counting from 0 at the first beat on the timeline. */
export const beatFrame = (n: number): number => pick(BEATS, n, "beat");

/** Master frame of backbeat n, counting from 0 at the first backbeat on the timeline. */
export const backbeatFrame = (n: number): number => pick(BACKBEATS, n, "backbeat");

/** Master frame halfway between beat n and beat n + 1. The track's 808s often hit there. */
export const halfBeatFrame = (n: number): number => Math.round((beatFrame(n) + beatFrame(n + 1)) / 2);

/**
 * Bass hits: attacks in the low band (< 120 Hz) measured by tools/bass-hits.py, as master frames.
 * The film's cuts sit on the strongest of them; scene ends still name a beat or half beat, and
 * this list is what that choice was read from (Studio warns when a cut misses one).
 */
export const BASS_HITS = onTimeline(
  bassHits.filter((h) => h.strength >= 18 && h.level >= 40).map((h) => Math.round(h.t * FPS)),
);
/** Bass hits inside a scene, as scene-local frames. */
export const bassHitsIn = (scene: Scene): number[] =>
  BASS_HITS.filter((h) => h >= scene.start && h < scene.start + scene.duration).map((h) => h - scene.start);

export const isBassHit = (frame: number, tolerance = 1): boolean =>
  BASS_HITS.some((b) => Math.abs(b - frame) <= tolerance);

/** The backbeat closest to a master frame. */
export const nearestBackbeat = (frame: number): number => nearestBeat(frame, BACKBEATS) ?? frame;

/** Is this master frame on a backbeat? Detected beats can sit a frame off the hit, hence the tolerance. */
export const isBackbeat = (frame: number, tolerance = 1): boolean =>
  BACKBEATS.some((b) => Math.abs(b - frame) <= tolerance);

// ---------------------------------------------------------------------------
// The scene list, in order. Each scene names the frame it ends on, written as
// a beat: backbeatFrame(n) for a cut (it lands with the snare and reads as a
// drum hit), beatFrame(n) when a cut should sit on some other beat on purpose.
// A scene starts where the previous one ended; the first starts at frame 0.
// To retime the film, change an index here and nothing else.
// ---------------------------------------------------------------------------
// This track's snare half is unclear (backbeat confidence 0.43), so cuts sit on its bass hits:
// the drop on beat 8 after the trim, then the 808s, which often fall on half beats.
const SCENE_ENDS = {
  // The hook plays over the end of the build and the near-silent break; the drop is the cut.
  hook: beatFrame(8),
  // The search take starts on the drop and its final tap is on half beat 14, the next big 808,
  // so the real scoreboard counts up on that hit. The cut is the 808 on half beat 21.
  search: halfBeatFrame(21),
  // Track beats below are absolute (timeline beat = track beat - 56).
  // Down the head-to-head; cut on the 808 at track beat 86.5, the strongest in the section.
  stats: halfBeatFrame(30),
  // Amund's career and the switch to light mode; cut on the 808 at track beat 102.5.
  player: halfBeatFrame(46),
  // The end card holds two bars, to track beat 110.
  end: beatFrame(54),
};

export type SceneName = keyof typeof SCENE_ENDS;

/** Each scene's start and duration in master frames. */
export const SCENES = (() => {
  const scenes = {} as Record<SceneName, Scene>;
  let start = 0;
  for (const name of Object.keys(SCENE_ENDS) as SceneName[]) {
    scenes[name] = { start, duration: SCENE_ENDS[name] - start };
    start = SCENE_ENDS[name];
  }
  return scenes;
})();

/**
 * Scene-local frame of the track's beat n, for a scene's own useCurrentFrame().
 * Unlike an index into sceneBeats(), it still means the same beat after the
 * scene's start has been moved, which is also its trap: move the scene far
 * enough and the beat falls outside it, silently. After changing the scene
 * table, re-check every call (gotchas.md 34).
 */
export const beatInScene = (n: number, scene: Scene): number => beatFrame(n) - scene.start;

/** Length of the film: the end of the last scene. */
export const TOTAL_FRAMES = Object.values(SCENES).reduce((sum, s) => sum + s.duration, 0);

// Studio-only checks. They warn instead of throwing because a cut off the
// backbeat is allowed; it should just be a decision and not an accident.
if (getRemotionEnvironment().isStudio) {
  for (const note of beats.warnings) console.warn(`[beats] ${note}`);
  if (!BEAT_SYNCED) console.warn("[timing] this film is not beat-synced: scene ends are placed by time.");
  for (const [name, scene] of Object.entries(SCENES)) {
    if (BEAT_SYNCED && scene.start > 0 && !isBassHit(scene.start, 2)) {
      console.warn(`[timing] scene "${name}" starts at frame ${scene.start}, which is not a bass hit.`);
    }
  }
}
