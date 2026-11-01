// Section « Notifications » des options : activer ou couper les notifications sur x.com.
import { Switch } from "@/ui/components/switch";
import { Hint, Panel } from "@/ui/layout/Section";
import { setNotify } from "./store.ts";

export function NotificationSettings({ notify }: { notify: boolean }) {
  return (
    <section>
      <Panel>
        <h2 className="mb-4 text-2xl leading-tight">Notifications</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3.5 font-bold">
          <Switch checked={notify} onCheckedChange={(checked) => void setNotify(checked)} />
          Afficher une notification sur X à chaque compte bloqué
        </label>
        <Hint>
          Un message « @nom vient d'être bloqué ! » s'affiche 5 secondes en haut à droite de x.com, avec un lien
          pour annuler.
        </Hint>
      </Panel>
    </section>
  );
}
