// Service worker : sérialise les écritures qui lisent l'état puis le réécrivent.
// Elles s'y appliquent une à la fois, d'où qu'elles viennent (onglets x.com,
// options, service worker lui-même). Sans cela, deux écritures simultanées
// liraient le même état et la seconde effacerait la première. Le registre des
// écritures permises vit dans features/writes.ts ; celles du traitement qui
// doivent tenir sans service worker restent directes, voir features/blocking/store.ts.
import { fromOptions, isWriteRequest, type WriteReply } from "./messages.ts";

export type WriteEntry = {
  run: (...args: never[]) => Promise<unknown>;
  /** Contrôle de chaque argument reçu, dans l'ordre : ils arrivent d'un autre contexte, sans garantie. */
  checks: ReadonlyArray<(value: unknown) => boolean>;
  /** Permise aux onglets x.com. Sinon, seule la page d'options peut la demander. */
  content: boolean;
};

let tail: Promise<unknown> = Promise.resolve();

/** Applique `task` après les écritures en cours, dans l'ordre d'arrivée. */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => {});
  return run;
}

function permitted({ checks, content }: WriteEntry, args: unknown[], sender: chrome.runtime.MessageSender): boolean {
  if (!content && !fromOptions(sender)) return false;
  return args.length <= checks.length && checks.every((check, i) => check(args[i]));
}

export function serveWrites(registry: Readonly<Record<string, WriteEntry>>): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: WriteReply) => void) => {
    if (!isWriteRequest(message) || sender.id !== chrome.runtime.id) return false;
    const entry = Object.hasOwn(registry, message.name) ? registry[message.name] : undefined;
    if (!entry) return false;
    if (!permitted(entry, message.args, sender)) {
      console.warn("[Barrage] écriture refusée :", message.name, sender.url);
      sendResponse({ ok: false, error: `Écriture refusée : ${message.name}.` });
      return false;
    }
    const write = entry.run as (...args: unknown[]) => Promise<unknown>;
    serial(() => write(...message.args)).then(
      (value) => sendResponse({ ok: true, value }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true; // réponse asynchrone
  });
}
