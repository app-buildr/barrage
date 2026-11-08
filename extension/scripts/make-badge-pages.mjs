// Génère la page de partage de chaque badge, docs/badge/<slug>/index.html, et
// son image docs/assets/og-badge-<slug>-<hash>.png (1200×630) : X tire la carte
// du tweet de partage de la page du badge (voir shareText). Les gabarits sont
// dans src/features/badges/sharePages.ts ; tests/badges.test.ts échoue si les
// fichiers du dépôt ne correspondent plus.
//
// Les images sont capturées par Chrome sans interface, piloté par le protocole
// DevTools : fenêtre de 1200×630 exacte, polices vérifiées avant la capture.
// CHROME donne son chemin s'il n'est pas à l'emplacement habituel sur macOS.
// Une image n'est remplacée qu'une fois la nouvelle écrite, et les fichiers des
// badges disparus ne sont supprimés qu'après toutes les captures.
//
// Usage : node scripts/make-badge-pages.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BADGES } from "../src/features/badges/badges.ts";
import {
  BADGE_IMAGE,
  IMAGE_FONTS,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  imageHtml,
  imageName,
  pageHtml,
} from "../src/features/badges/sharePages.ts";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../docs");
const ASSETS = join(DOCS, "assets");
const PAGES = join(DOCS, "badge");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TIMEOUT_MS = 60_000;

/** Client minimal du protocole DevTools sur la WebSocket du navigateur. */
function devtools(ws) {
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", ({ data }) => {
    const msg = JSON.parse(String(data));
    if (msg.id === undefined) {
      for (const listener of listeners) listener(msg);
      return;
    }
    const call = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) call?.reject(new Error(`${call.method} : ${msg.error.message}`));
    else call?.resolve(msg.result);
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject, method });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      }),
    once: (method) =>
      new Promise((resolve) => {
        const listener = (msg) => {
          if (msg.method !== method) return;
          listeners.delete(listener);
          resolve(msg.params);
        };
        listeners.add(listener);
      }),
  };
}

/** Adresse DevTools que Chrome écrit dans son profil au démarrage. */
async function devtoolsUrl(profile, signal) {
  const file = join(profile, "DevToolsActivePort");
  while (!signal.aborted) {
    if (existsSync(file)) {
      const [port, path] = readFileSync(file, "utf8").split("\n");
      if (path) return `ws://127.0.0.1:${port}${path}`;
    }
    await delay(100);
  }
  throw new Error("Chrome n'a pas ouvert DevTools");
}

/** Ouvre la page, vérifie ses polices et renvoie la capture en PNG. */
async function shoot(profile, url, signal) {
  const ws = new WebSocket(await devtoolsUrl(profile, signal));
  signal.addEventListener("abort", () => ws.close());
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("connexion à Chrome impossible")), { once: true });
  });
  const { send, once } = devtools(ws);
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  // La fenêtre fait exactement la taille de l'image : --window-size compte
  // aussi le cadre du navigateur et laissait une page de 1200×543.
  await page("Emulation.setDeviceMetricsOverride", {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = once("Page.loadEventFired");
  await page("Page.navigate", { url });
  await loaded;
  const fonts = await page("Runtime.evaluate", {
    expression: `Promise.all(${JSON.stringify(IMAGE_FONTS)}.map(async (font) => ((await document.fonts.load(font)).length ? null : font)))
      .then(async (missing) => { await document.fonts.ready; return missing.filter(Boolean); })`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (fonts.exceptionDetails) throw new Error(`vérification des polices : ${fonts.exceptionDetails.text}`);
  if (fonts.result.value.length) throw new Error(`polices non chargées (réseau ?) : ${fonts.result.value.join(", ")}`);
  const { data } = await page("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: IMAGE_WIDTH, height: IMAGE_HEIGHT, scale: 1 },
  });
  return Buffer.from(data, "base64");
}

/** Capture le gabarit en PNG 1200×630 dans `out`, écrit d'un coup ou pas du tout. */
async function capture(html, out) {
  const dir = mkdtempSync(join(tmpdir(), "barrage-og-"));
  const file = join(dir, "og.html");
  const profile = join(dir, "profile");
  writeFileSync(file, html);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const stopped = new Promise((resolve) => chrome.once("close", resolve));
  const exited = new Promise((_, reject) => {
    chrome.once("error", (error) => reject(new Error(`Chrome introuvable ou non lancé (${CHROME}) : ${error.message}`)));
    chrome.once("exit", (code, sig) => reject(new Error(`Chrome s'est arrêté avant la capture (${code ?? sig})`)));
  });
  const abort = new AbortController();
  const timeout = delay(TIMEOUT_MS, undefined, { signal: abort.signal }).then(() => {
    throw new Error(`capture interrompue après ${TIMEOUT_MS / 1000} s`);
  });
  try {
    const png = await Promise.race([shoot(profile, pathToFileURL(file).href, abort.signal), exited, timeout]);
    if (png.length === 0) throw new Error("capture vide");
    const tmp = `${out}.tmp`;
    writeFileSync(tmp, png);
    renameSync(tmp, out);
  } catch (error) {
    throw new Error(`${error.message}${stderr ? `\n--- stderr de Chrome ---\n${stderr}` : ""}`, { cause: error });
  } finally {
    abort.abort();
    timeout.catch(() => {});
    if (chrome.pid !== undefined && chrome.exitCode === null && chrome.signalCode === null) {
      chrome.kill();
      await stopped;
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

mkdirSync(ASSETS, { recursive: true });
const images = new Set();
for (const badge of BADGES) {
  const image = await imageName(badge);
  images.add(image);
  if (!existsSync(join(ASSETS, image))) {
    await capture(imageHtml(badge), join(ASSETS, image));
    console.log(`image : ${image}`);
  }
  const dir = join(PAGES, badge.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), pageHtml(badge, image));
}

// Toutes les pages pointent sur leur image : les fichiers qui ne servent plus
// (image remplacée, badge supprimé ou renommé) peuvent partir.
for (const file of readdirSync(ASSETS)) {
  if (BADGE_IMAGE.test(file) && !images.has(file)) {
    rmSync(join(ASSETS, file));
    console.log(`supprimée : ${file}`);
  }
}
const slugs = new Set(BADGES.map((badge) => badge.slug));
for (const slug of readdirSync(PAGES)) {
  if (!slugs.has(slug)) {
    rmSync(join(PAGES, slug), { recursive: true, force: true });
    console.log(`page supprimée : docs/badge/${slug}/`);
  }
}
console.log(`${BADGES.length} pages de badge dans docs/badge/`);
