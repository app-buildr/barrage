// Pile des notifications, en haut à droite de x.com.
import { useSyncExternalStore } from "react";
import { BadgeToast } from "./BadgeToast.tsx";
import { Toast } from "./Toast.tsx";
import type { BadgeStore, ToastStore } from "./toasts.ts";

type Props = { store: ToastStore; badges: BadgeStore; onDismissBadge: (palier: number) => void; onOpenBadges: () => void };

export function Toaster({ store, badges, onDismissBadge, onOpenBadges }: Props) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const palier = useSyncExternalStore(badges.subscribe, badges.getSnapshot);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none flex flex-col items-end gap-2.5 font-sans">
      {/* Au-dessus de la pile, et hors de sa limite : elle ne l'évince jamais. */}
      {palier !== null ? <BadgeToast key={palier} palier={palier} onDismiss={onDismissBadge} onOpenBadges={onOpenBadges} /> : null}
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} store={store} />
      ))}
    </div>
  );
}
