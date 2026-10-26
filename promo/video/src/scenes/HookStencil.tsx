// Debug composition: the hook's last frame as the mask transition's stencil, at camera scale 1.
// Used once to measure where the "?" dot sits (tools note in docs/video/notes.md).
import { AbsoluteFill } from "remotion";
import { HookCard } from "./Hook";

export const HookStencil: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <HookCard frozen="stencil" />
  </AbsoluteFill>
);
