// Faux x.com pour le traitement de la liste : cookies, verrou Web Locks partagé
// entre onglets, et table de réponses pour /i/api/1.1/*. Chaque requête est
// journalisée dans `requests`.

export type XRequest = { method: string; path: string; handle: string | null; headers: Record<string, string>; body: string };
type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> } | "offline";
type Route = (request: XRequest) => Reply;

export const LOOKUP = "/i/api/1.1/friendships/lookup.json";
export const BLOCK = "/i/api/1.1/blocks/create.json";
export const UNBLOCK = "/i/api/1.1/blocks/destroy.json";

/** Réponse de lookup : ces comptes existent, et `blocking` en fait partie des bloqués. */
export const lookupReply = (handles: readonly string[], blocking: readonly string[] = []): Reply => ({
  json: handles.map((screen_name) => ({
    screen_name,
    connections: blocking.includes(screen_name) ? ["blocking"] : ["none"],
  })),
});

export const apiError = (code: number, status = 403, headers?: Record<string, string>): Reply => ({
  status,
  json: { errors: [{ code, message: `erreur ${code}` }] },
  ...(headers ? { headers } : {}),
});

/** Verrou exclusif par nom : les demandes attendent leur tour, dans l'ordre. */
function fakeLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request(name: string, task: () => Promise<unknown>): Promise<unknown> {
      const run = (tails.get(name) ?? Promise.resolve()).then(task, task);
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
}

export function installX(session: { twid?: string; ct0?: string } = { twid: "u%3D1", ct0: "jeton" }) {
  const x = {
    /** Remplaçable : twid, ct0. Une clé absente est un cookie absent. */
    cookies: { ...session } as Record<string, string>,
    requests: [] as XRequest[],
    /** Réponses de chaque route ; par défaut, tous les comptes existent et le POST réussit. */
    routes: {
      [LOOKUP]: (request) => lookupReply((request.handle ?? "").split(",")),
      [BLOCK]: () => ({ json: {} }),
      [UNBLOCK]: () => ({ json: {} }),
    } as Record<string, Route>,
    posts: (path: string) => x.requests.filter((request) => request.path === path).map((request) => request.handle),
  };

  const stub = (name: string, value: unknown) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  stub("document", {
    get cookie() {
      return Object.entries(x.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    },
    querySelector: () => null,
  });
  stub("location", { origin: "https://x.com", pathname: "/home" });
  stub("navigator", { locks: fakeLocks() });
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const body = String(init.body ?? "");
    const params = init.method === "POST" ? new URLSearchParams(body) : url.searchParams;
    const request: XRequest = {
      method: init.method ?? "GET",
      path: url.pathname,
      handle: params.get("screen_name"),
      headers: init.headers as Record<string, string>,
      body,
    };
    x.requests.push(request);
    const reply = x.routes[url.pathname]?.(request) ?? { status: 404, text: "" };
    if (reply === "offline") throw new TypeError("Failed to fetch");
    const content = reply.json === undefined ? (reply.text ?? "") : JSON.stringify(reply.json);
    return new Response(content, { status: reply.status ?? 200, headers: reply.headers ?? {} });
  }) as typeof fetch;
  return x;
}

export type FakeX = ReturnType<typeof installX>;
