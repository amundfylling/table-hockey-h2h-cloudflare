// The site's fonts, served from public/fonts (copied from Google Fonts with
// `fonts.json` listing family, weight, file and unicode range). Self-hosted because
// the render browser cannot reach fonts.gstatic.com from every machine.

import { continueRender, delayRender, staticFile } from "remotion";
import faces from "./fonts.json";

let started = false;

export const loadSiteFonts = () => {
  if (started) return;
  started = true;
  const handle = delayRender("Loading the site's fonts");
  Promise.all(
    faces.map((f) => {
      const face = new FontFace(f.family, `url(${staticFile(`fonts/${f.file}`)}) format("woff2")`, {
        weight: f.weight,
        unicodeRange: f.unicodeRange,
        display: "block",
      });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
};
