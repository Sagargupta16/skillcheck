import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  // Declarations come from `tsc --emitDeclarationOnly` in the build script, not
  // from here. tsup vendors rollup-plugin-dts@6.1.1 into its own dist bundle,
  // and that copy reads a TS compiler internal that TypeScript 7 (the native
  // port) no longer exposes, so `dts: true` dies with
  // "Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')".
  // Bumping the dependency cannot fix it -- the plugin is bundled, not
  // installed, and tsup 8.5.1 is already latest. tsc always supports its own
  // version, so generating declarations there is version-proof.
  dts: false,
  clean: true,
  target: "node22",
  // package.json is the single source of truth for the version. Inlining it
  // here keeps `--version` and the SARIF tool.driver.version honest without a
  // runtime file read or a second constant to forget.
  define: { __SKILLCHECK_VERSION__: JSON.stringify(pkg.version) },
});
