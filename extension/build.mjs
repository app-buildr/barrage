// Build de l'extension dans dist/ : les trois surfaces passent par Vite (voir
// vite.config.ts), les fichiers statiques sont copiés à côté.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "vite";
import { surfaceConfig } from "./vite.config.ts";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

function copyStatic() {
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("icons", "dist/icons", { recursive: true });
  // Licence OFL des polices : elle accompagne les fichiers redistribués.
  for (const license of ["LICENSE-inter.txt", "LICENSE-bricolage-grotesque.txt"]) {
    cpSync(`src/ui/fonts/${license}`, `dist/fonts/${license}`);
  }
}

/** Recopie aussi à chaque reconstruction en mode surveillance. */
const copyStaticPlugin = { name: "copy-static", closeBundle: copyStatic };

for (const surface of ["background", "content", "options"]) {
  await build(surfaceConfig(surface, watch, [copyStaticPlugin]));
}

if (watch) console.log("Barrage : surveillance des fichiers, Ctrl+C pour arrêter.");
