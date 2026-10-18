/** Serve dist-site/ on http://localhost:4173 for a local look at the
 * playground (`pnpm site:build`, then `pnpm site:serve`). Static files only,
 * no dependencies. */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist-site/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const rel = normalize(path === "/" ? "index.html" : path.slice(1));
  if (rel.startsWith("..")) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, {
      "content-type": TYPES[extname(rel)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => {
  console.log(`playground on http://localhost:${port}/`);
});
