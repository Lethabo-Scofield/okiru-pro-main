import esbuild from "esbuild";

const sharedConfig = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["bcrypt", "pdfjs-dist"],
  sourcemap: true,
  minify: false,
};

await esbuild.build({
  ...sharedConfig,
  entryPoints: ["index.ts"],
  outfile: "dist/index.cjs",
});

// Worker thread bundled separately so it can be loaded via Worker(path)
await esbuild.build({
  ...sharedConfig,
  entryPoints: ["src/workers/excelParseWorker.ts"],
  outfile: "dist/excelParseWorker.cjs",
});

console.log("Build complete: dist/index.cjs + dist/excelParseWorker.cjs");
