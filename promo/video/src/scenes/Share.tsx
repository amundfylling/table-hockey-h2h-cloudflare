// Share - tap "Share image" on the head-to-head and the site draws its share card. The phone's
// share sheet is not something the site draws, so it stays a plain sheet; the image in it is the
// real one the site made in the take (public/takes/share.png, saved by take-share.js).

import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FootageScene } from "../components/FootageScene";
import { placeTake, type Take } from "../components/Footage";
import { PT, SCREEN } from "../components/Phone";
import { easings } from "../easings";
import { colors, fonts } from "../theme";
import { SCENES, beatFrame, hitNear } from "../timing";
import take from "../../public/takes/share.json";

const scene = SCENES.share;
const t = take as Take & { shared_file?: string };
const ANCHORS = [{ label: "share image", frame: hitNear(beatFrame(76)) - scene.start }];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Sheet: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const p = easings.slowInLand(interpolate(frame, [at, at + 12], [0, 1], clamp));
  if (p <= 0) return null;
  const w = SCREEN.w * PT;
  const h = (SCREEN.h - SCREEN.statusBar) * PT;
  const img = 330 * PT;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, background: `rgba(0, 0, 0, ${0.45 * p})` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          width: w,
          top: h - 560 * PT * p,
          height: 600 * PT,
          borderRadius: 26 * PT,
          background: "#1C1F23",
          boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: fonts.ui,
          color: colors.ink,
        }}
      >
        <div style={{ width: 36 * PT, height: 5 * PT, borderRadius: 3 * PT, background: "#4A4F55", marginTop: 8 * PT }} />
        <div style={{ fontSize: 13 * PT, color: colors.inkMuted, marginTop: 14 * PT, marginBottom: 14 * PT }}>
          {t.shared_file ?? "h2h.png"}
        </div>
        <Img
          src={staticFile("takes/share.png")}
          style={{ width: img, height: img, borderRadius: 14 * PT, boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)" }}
        />
      </div>
    </>
  );
};

export const Share: React.FC = () => {
  const { fps } = useVideoConfig();
  const { skip, rate } = placeTake(t, ANCHORS, fps);
  const ready = t.events.find((e) => e.label === "image ready")!.t;
  const at = Math.round(((ready / 1000) * fps - skip * fps) / rate) + 3;
  return (
    <FootageScene
      scene={scene}
      src="takes/share.mp4"
      take={t}
      anchors={ANCHORS}
      origin="50% 60%"
      camera={[
        { frame: 0, scale: 1.0 },
        { frame: at, scale: 1.0 },
        { frame: at + 20, scale: 1.08, ease: "slowInLand" },
        { frame: scene.duration, scale: 1.12 },
      ]}
      screen={<Sheet at={at} />}
    />
  );
};
