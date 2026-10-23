// Derives the dark theme of a screen from the light one: a palette swap plus
// the few places where dark mode changes more than a colour.
(light, top) => {
  const M = { "#182025": "#F3F5F7", "#4A5568": "#A5B0BB", "#5c6770": "#a5b0bb", "#246857": "#7ED9C6", "#AD3F24": "#F08B6F", "#2A7564": "#5DC2AE", "#C44B2D": "#F08B6F", "#FFFDFA": "#1D242C", "#F0EBE3": "#151A1F", "#F6F2EC": "#0F1215" };
  const swap = (v) => JSON.parse(JSON.stringify(v).replace(/#[0-9A-Fa-f]{6}/g, (h) => M[h] ?? h));
  const items = light.items.map((it, i) => {
    if (i === 2) return it; // logo glyph stays white
    const d = swap(it);
    if (it.fill === "#FFFFFF") d.fill = "#1B2128";
    if (it.color === "#FFFFFF") d.color = "#0F1215";
    if (it.fill === "#FFFDFA") {
      d.stroke = { hex: "#FFFFFF", a: 0.1, w: 1 };
      if (it.shadow === "rgba(0, 0, 0, 0.05) 0px 6px 18px 0px") d.shadow = "rgba(0, 0, 0, 0.35) 0px 8px 24px 0px";
    }
    if (it.name === ".hero-lead-tag") d.fill = { hex: "#5DC2AE", a: 0.2 };
    if (it.grad) d.grad = it.name === ".logo" ? "linear-gradient(135deg, rgb(239, 108, 68) 0%, rgb(240, 139, 111) 100%)" : top.bodyBgImage;
    if (it.shadow && it.shadow.startsWith("rgb(255, 255, 255) 0px 0px 0px 2px")) d.shadow = "rgb(27, 33, 40) 0px 0px 0px 2px, color(srgb 0.647059 0.690196 0.733333 / 0.45) 0px 0px 0px 4px";
    if (it.name === "svg" && it.svg && it.svg.includes("M12 3a6 6 0 0 0 9 7.4")) d.svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F5F7" stroke-width="1.8px" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"></line><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"></line><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"></line></svg>';
    return d;
  });
  return { ...light, ...top, items };
}
