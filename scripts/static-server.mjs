// A tiny static file server for checks that load the built site in a browser
// (a11y-check.mjs, smoke-check.mjs). Serves `root` on a free local port.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

export function serve(root) {
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    let path = join(root, relative);
    try {
      if (statSync(path).isDirectory()) path = join(path, "index.html");
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    createReadStream(path).on("error", () => res.end()).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
