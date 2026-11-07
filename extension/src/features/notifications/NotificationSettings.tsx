// Carte « Notifications » de Réglages : activer ou couper les notifications sur x.com.
import { plural } from "@/core/format.ts";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { Switch } from "@/ui/components/switch.tsx";
import { Hint, Panel, StatusMessage } from "@/ui/layout/Section.tsx";
import { TOAST_MS } from "./toasts.ts";

export function NotificationSettings({ notify, notifyBadges }: { notify: boolean; notifyBadges: boolean }) {
  const { error, attempt } = useSafeWrite();
  return (
    <section>
      <Panel>
        <h2 className="mb-4">Notifications</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3.5 font-bold">
          <Switch checked={notify} onCheckedChange={(checked) => void attempt(write("setNotifications", { notify: checked }))} />
          Afficher une notification sur X à chaque compte bloqué
        </label>
        <Hint>
          Un message « @nom vient d'être bloqué ! » s'affiche {plural(TOAST_MS / 1000, "seconde")} en haut à droite de
          x.com, avec un lien pour annuler.
        </Hint>
        <hr className="my-5 border-line" />
        <label className="flex min-h-11 cursor-pointer items-center gap-3.5 font-bold">
          <Switch checked={notifyBadges} onCheckedChange={(checked) => void attempt(write("setNotifications", { notifyBadges: checked }))} />
          Afficher une notification à chaque nouveau badge
        </label>
        <Hint>
          Quand vous atteignez un palier, un message reste affiché sur x.com jusqu'à ce que vous le fermiez ou le
          partagiez.
        </Hint>
        <StatusMessage kind="error" message={error} className="mt-3" />
      </Panel>
    </section>
  );
}
