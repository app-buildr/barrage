import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

function copyStatic() {
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("src/entries/options.html", "dist/options.html");
  cpSync("icons", "dist/icons", { recursive: true });
  // Licence OFL des polices : elle accompagne les fichiers redistribués.
  for (const license of ["LICENSE-inter.txt", "LICENSE-bricolage-grotesque.txt"]) {
    cpSync(`src/ui/fonts/${license}`, `dist/fonts/${license}`);
  }
}

const ctx = await esbuild.context({
  entryPoints: {
    background: "src/entries/background.ts",
    content: "src/entries/content.ts",
    options: "src/entries/options.ts",
  },
  // Gabarits des fonctionnalités embarqués comme texte ; les CSS importés
  // donnent content.css et options.css, les polices sont copiées dans fonts/.
  loader: { ".html": "text", ".woff2": "file" },
  assetNames: "fonts/[name]",
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [
    {
      name: "copy-static",
      setup(build) {
        build.onEnd(() => copyStatic());
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  console.log("Barrage : surveillance des fichiers, Ctrl+C pour arrêter.");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
