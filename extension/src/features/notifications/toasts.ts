// Pile des notifications affichées sur x.com, sans DOM : les composants de
// Toaster.tsx la dessinent, watch.ts l'alimente. Testée dans tests/toasts.test.ts.

/** Le temps de lire et, au besoin, de cliquer « Annuler ». */
export const TOAST_MS = 5000;
/** Confirmation de « Annuler » : rien à faire, juste à lire. */
export const CONFIRM_MS = 3000;
/** Au-delà, les plus anciennes notifications cèdent la place. */
export const MAX_TOASTS = 3;

/**
 * Contenu d'une notification, remplaçable sur place. Espaces insécables
 * ( ) avant la ponctuation : elle ne passe jamais seule à la ligne.
 */
export type Content = {
  kind: "blocked" | "unblocked";
  /** Suite du titre, après le nom. */
  title: string;
  /** Ligne secondaire : texte, puis bouton « Annuler » si `undo` est fourni. */
  detail: string;
  undo?: () => void;
  /** Durée d'affichage, TOAST_MS par défaut. */
  duration?: number;
  /** Faux : le décompte continue sous la souris, rien à cliquer. Vrai par défaut. */
  pausable?: boolean;
};

/**
 * Notification de la pile. `revision` change à chaque nouveau contenu : le
 * décompte repart. `leaving` : animation de sortie en cours, plus réutilisée.
 */
export type ToastItem = { id: number; handle: string; content: Content; revision: number; leaving: boolean };

type Listener = () => void;

export type ToastStore = {
  getSnapshot(): readonly ToastItem[];
  subscribe(listener: Listener): () => void;
  /** Affiche, ou met à jour la notification encore visible du même compte. */
  show(handle: string, content: Content): void;
  /** Lance la sortie d'une notification. */
  leave(id: number): void;
  /** Retire une notification de la pile, à la fin de sa sortie. */
  remove(id: number): void;
  /** Retire tout, sans animation. */
  clear(): void;
};

export function createToastStore(): ToastStore {
  let items: readonly ToastItem[] = [];
  let nextId = 1;
  const listeners = new Set<Listener>();

  function set(next: readonly ToastItem[]): void {
    items = next;
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(handle, content) {
      const existing = items.find((t) => t.handle === handle && !t.leaving);
      if (existing) {
        set(items.map((t) => (t === existing ? { ...t, content, revision: t.revision + 1 } : t)));
        return;
      }
      set([...items, { id: nextId++, handle, content, revision: 0, leaving: false }].slice(-MAX_TOASTS));
    },
    leave(id) {
      if (items.some((t) => t.id === id && !t.leaving)) set(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    },
    remove(id) {
      if (items.some((t) => t.id === id)) set(items.filter((t) => t.id !== id));
    },
    clear() {
      if (items.length) set([]);
    },
  };
}
