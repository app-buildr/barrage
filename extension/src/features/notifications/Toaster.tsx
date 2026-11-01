// Pile des notifications, en haut à droite de x.com.
import { useSyncExternalStore } from "react";
import { Toast } from "./Toast.tsx";
import type { ToastStore } from "./toasts.ts";

export function Toaster({ store }: { store: ToastStore }) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none flex flex-col items-end gap-2.5 font-sans">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} store={store} />
      ))}
    </div>
  );
}
