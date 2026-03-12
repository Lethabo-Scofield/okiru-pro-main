import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.cjs",
  external: [
    "bcrypt",
  ],
  sourcemap: true,
  minify: false,
});

console.log("Build complete: dist/index.cjs");
