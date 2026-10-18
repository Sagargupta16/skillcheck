import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
) as { version: string };

// The browser playground (site/). It bundles the same rule modules the CLI
// ships, plus `yaml`, into one script; site/public/ is copied next to it.
// Output goes to dist-site/, which the Pages workflow uploads as-is.
export default defineConfig({
  entry: { playground: "site/playground.ts" },
  outDir: "dist-site",
  publicDir: "site/public",
  format: ["iife"],
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  clean: true,
  dts: false,
  outExtension: () => ({ js: ".js" }),
  define: { __SKILLCHECK_VERSION__: JSON.stringify(pkg.version) },
});
