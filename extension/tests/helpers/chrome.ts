// Faux chrome.storage.local. Le vrai `get` prend un objet de valeurs par défaut
// et ne renvoie la valeur stockée que si la clé existe : le stub reproduit ce
// contrat, c'est lui que le code sous test exerce.

type Store = Record<string, unknown>;

/** @param read stockage courant, relu à chaque appel : un test peut le remplacer */
export function installChrome(read: () => Store, extra: Record<string, unknown> = {}): void {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (defaults: Store | null) =>
          defaults === null
            ? { ...read() }
            : Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, k in read() ? read()[k] : v])),
        set: async (values: Store) => {
          Object.assign(read(), values);
        },
        remove: async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete read()[key];
        },
      },
    },
    ...extra,
  };
}
