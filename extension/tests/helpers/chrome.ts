// Faux chrome, fidèle à ce dont le code dépend. `get` prend un objet de valeurs
// par défaut et ne renvoie la valeur stockée que si la clé existe. Les valeurs
// font un aller-retour JSON à l'écriture et à la lecture, comme dans le vrai
// stockage : un Set, un undefined ou un Infinity n'y survivent pas. Toute
// écriture modifiant une clé émet onChanged, et les messages passent par les
// écouteurs enregistrés : write() va jusqu'à serveWrites, si le test l'a appelé.
// L'expéditeur est la page d'options, sauf dans un test qui parle pour un onglet
// x.com avec `extra.sender`, voir X_TAB.

type Store = Record<string, unknown>;
type Change = { oldValue?: unknown; newValue?: unknown };
type Listener = (...args: any[]) => unknown;

/** Expéditeur d'un message venu de la page d'options. */
export const OPTIONS_PAGE = { id: "barrage", url: "chrome-extension://barrage/options.html#comptes" };
/** Expéditeur d'un message venu d'un onglet x.com. */
export const X_TAB = { id: "barrage", url: "https://x.com/home" };

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Événement chrome : ses écouteurs sont conservés, `fire` les appelle. */
export function fakeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => void listeners.add(listener),
    removeListener: (listener: Listener) => void listeners.delete(listener),
    fire: (...args: unknown[]) => [...listeners].map((listener) => listener(...args)),
  };
}

/**
 * @param read stockage courant, relu à chaque appel : un test peut le remplacer
 * @param extra propriétés de `chrome` à ajouter ; `runtime` complète celle du faux
 */
export function installChrome(read: () => Store, { sender = OPTIONS_PAGE, ...extra }: Record<string, any> = {}) {
  const onChanged = fakeEvent();
  const onMessage = fakeEvent();
  const onInstalled = fakeEvent();
  const onStartup = fakeEvent();
  const onAlarm = fakeEvent();

  const emit = (changes: Record<string, Change>): void => {
    // Après la fin de l'écriture, jamais pendant, comme le vrai événement.
    if (Object.keys(changes).length) queueMicrotask(() => onChanged.fire(changes, "local"));
  };

  /** Comme un vrai message : sérialisé, et réponse attendue si un écouteur le demande. */
  const sendMessage = (message: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      const copy = clone(message);
      const reply = (value: unknown) => resolve(clone(value));
      const pending = onMessage.fire(copy, sender, reply);
      if (!pending.includes(true)) resolve(undefined);
    });

  const chrome = {
    storage: {
      onChanged,
      local: {
        get: async (query: Store | string | string[] | null) => {
          const stored = read();
          if (query === null) return clone(stored);
          const defaults = typeof query === "string" || Array.isArray(query)
            ? Object.fromEntries([query].flat().map((key) => [key, undefined]))
            : query;
          const found = Object.entries(defaults).map(([k, v]) => [k, k in stored ? clone(stored[k]) : v]);
          return Object.fromEntries(found.filter(([, v]) => v !== undefined));
        },
        set: async (values: Store) => {
          const stored = read();
          const changes: Record<string, Change> = {};
          for (const [key, value] of Object.entries(clone(values))) {
            if (key in stored && same(stored[key], value)) continue;
            changes[key] = { ...(key in stored ? { oldValue: stored[key] } : {}), newValue: value };
            stored[key] = value;
          }
          emit(clone(changes));
        },
        remove: async (keys: string | string[]) => {
          const stored = read();
          const changes: Record<string, Change> = {};
          for (const key of [keys].flat()) {
            if (!(key in stored)) continue;
            changes[key] = { oldValue: stored[key] };
            delete stored[key];
          }
          emit(clone(changes));
        },
      },
    },
    alarms: { onAlarm, create() {} },
    ...extra,
    runtime: {
      id: "barrage",
      onMessage,
      onInstalled,
      onStartup,
      sendMessage,
      getManifest: () => ({ version: "1.4.0" }),
      getURL: (path: string) => `chrome-extension://barrage/${path}`,
      ...extra.runtime,
    },
  };
  (globalThis as any).chrome = chrome;
  return { onChanged, onMessage, onInstalled, onStartup, onAlarm, sendMessage };
}
