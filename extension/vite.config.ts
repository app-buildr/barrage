// Configuration Vite des trois surfaces de l'extension, utilisée par build.mjs :
// - options : page HTML, modules ES (les pages d'extension les acceptent) ;
// - content et background : un seul fichier IIFE chacun, comme l'exige un
//   content script et comme le manifest déclare le service worker.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type InlineConfig, type Plugin } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
const dist = fileURLToPath(new URL("./dist", import.meta.url));

export type Surface = "options" | "content" | "background";


const shared = (watch: boolean): InlineConfig => ({
  configFile: false,
  resolve: { alias: { "@": src } },
  publicDir: false,
  logLevel: "info",
  // React lit process.env.NODE_ENV, absent d'un content script ou d'un service worker.
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: "chrome120",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    // Aucune ressource en data: URL, les polices restent des fichiers.
    assetsInlineLimit: 0,
    watch: watch ? {} : null,
  },
});

export function surfaceConfig(surface: Surface, watch = false, plugins: Plugin[] = []): InlineConfig {
  const base = shared(watch);
  if (surface === "options") {
    return {
      ...base,
      root: `${src}/entries`,
      base: "./",
      plugins: [react(), tailwindcss(), ...plugins],
      build: {
        ...base.build,
        rollupOptions: {
          input: { options: `${src}/entries/options.html` },
          output: {
            entryFileNames: "[name].js",
            chunkFileNames: "[name].js",
            assetFileNames: (asset) =>
              asset.names.some((n) => n.endsWith(".woff2")) ? "fonts/[name][extname]" : "[name][extname]",
          },
        },
      },
    };
  }
  return {
    ...base,
    plugins: [react(), tailwindcss(), ...plugins],
    build: {
      ...base.build,
      lib: {
        entry: `${src}/entries/${surface}.ts`,
        formats: ["iife"],
        name: `barrage_${surface}`,
        fileName: () => `${surface}.js`,
        // Styles injectés dans les pages x.com, déclarés dans le manifest.
        cssFileName: surface,
      },
    },
  };
}

// `vite` sans argument (et le CLI shadcn) voient la page d'options.
export default defineConfig(surfaceConfig("options"));
