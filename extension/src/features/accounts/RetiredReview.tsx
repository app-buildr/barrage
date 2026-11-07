// Carte « comptes retirés des listes », en tête de l'onglet Comptes : les
// comptes qu'une mise à jour a sortis d'une liste alors que Barrage les avait
// bloqués. Rien n'est débloqué sans ce choix. Cochés par défaut : à débloquer.
import { useId, useMemo, useState } from "react";
import { ListMinus } from "lucide-react";
import { plural } from "@/core/format.ts";
import { formatShortDate } from "@/core/intl.ts";
import type { State } from "@/core/state.ts";
import { write } from "@/core/write.ts";
import { Badge } from "@/ui/components/badge.tsx";
import { Button } from "@/ui/components/button.tsx";
import { Checkbox } from "@/ui/components/checkbox.tsx";
import { Panel, StatusMessage } from "@/ui/layout/Section.tsx";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { lastRetiredAt, retiredChoice, retiredLines } from "./retired.ts";

export function RetiredReview({ state }: { state: State }) {
  // Décochés : à garder bloqués. Un compte retiré entre-temps arrive coché.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { error, attempt } = useSafeWrite();
  const title = useId();
  const lines = useMemo(() => retiredLines(state), [state]);
  if (!lines.length) return null;

  const { retired } = state;
  const choice = retiredChoice(retired, unchecked);
  const selected = choice.unblock.length;
  const all = selected === retired.length ? true : selected === 0 ? false : "indeterminate";
  const at = lastRetiredAt(state);

  function toggle(handle: string, checked: boolean): void {
    const next = new Set(unchecked);
    if (checked) next.delete(handle);
    else next.add(handle);
    setUnchecked(next);
  }

  function resolve(unblock: string[], keep: string[]): void {
    setBusy(true);
    void attempt(write("resolveRetired", unblock, keep)).then((ok) => {
      setBusy(false);
      if (ok) setUnchecked(new Set());
    });
  }

  return (
    <Panel role="region" aria-labelledby={title} className="mb-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 flex-none place-content-center rounded-icon bg-sun-soft text-coral-deep">
          <ListMinus className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h3 id={title} className="m-0 text-xl">
          {plural(retired.length, "compte retiré des listes", "comptes retirés des listes")}
        </h3>
      </div>
      <p className="mt-0 mb-4 text-body text-muted-foreground">
        {retired.length > 1 ? "Ces comptes ont été retirés" : "Ce compte a été retiré"} de vos listes lors de la
        dernière mise à jour{at === null ? "" : ` (${formatShortDate(at)})`}.{" "}
        {retired.length > 1 ? "Ils sont toujours bloqués" : "Il est toujours bloqué"} sur X. Voulez-vous{" "}
        {retired.length > 1 ? "les débloquer ? Décochez ceux que vous voulez garder bloqués." : "le débloquer ?"}
      </p>
      <div className="overflow-hidden rounded-step border border-line">
        <label className="flex cursor-pointer items-center gap-4 border-b border-line bg-cream px-5 py-3 text-label font-bold text-ink">
          <Checkbox
            checked={all}
            disabled={busy}
            onCheckedChange={(checked) => setUnchecked(checked === true ? new Set() : new Set(retired))}
          />
          <span className="flex-1">Tout cocher / tout décocher</span>
          <span aria-live="polite">
            {selected} sur {retired.length}
          </span>
        </label>
        <ul className="m-0 list-none p-0">
          {lines.map((line) => (
            <li key={line.handle} className="border-b border-line last:border-b-0">
              <label className="flex cursor-pointer items-center gap-4 px-5 py-3">
                <Checkbox
                  checked={!unchecked.has(line.handle)}
                  disabled={busy}
                  onCheckedChange={(checked) => toggle(line.handle, checked === true)}
                />
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-base text-ink">@{line.handle}</strong>
                  <span className="text-label text-muted-foreground">Retiré de {line.from}</span>
                </span>
                {line.blocked ? (
                  <Badge variant="coral" className="leading-5">
                    Bloqué
                  </Badge>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={busy || selected === 0} onClick={() => resolve(choice.unblock, choice.keep)}>
          Débloquer la sélection ({selected})
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => resolve([], [...retired])}>
          Tout garder bloqué
        </Button>
      </div>
      <StatusMessage kind="error" message={error} className="mt-3" />
    </Panel>
  );
}
