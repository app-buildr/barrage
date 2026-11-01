// Formulaire « Ajouter des comptes » : un ou plusieurs comptes séparés par
// des espaces, virgules ou points-virgules.
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/components/button";
import { Input } from "@/ui/components/input";
import { Hint, Panel } from "@/ui/layout/Section";
import { cn } from "@/ui/lib/utils";
import { write } from "@/core/write.ts";
import { parseInput } from "./handles.ts";

/** « @a, @b et @c », tronqué au-delà de quelques noms. */
function names(handles: readonly string[], prefix = "@"): string {
  const shown = handles.slice(0, 5).map((h) => prefix + h);
  const more = handles.length - shown.length;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}` : (shown[0] ?? "");
  return more > 0 ? `${shown.join(", ")} et ${more} autre(s)` : list;
}

type Report = { message: string; kind: "ok" | "warn" | "error" };

const REPORT_COLORS: Record<Report["kind"], string> = {
  ok: "text-coral-deep",
  warn: "text-sun-soft-ink",
  error: "text-state-problem",
};

export function AddForm() {
  const [value, setValue] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    const { handles, invalid } = parseInput(value);
    if (!handles.length && !invalid.length) return;
    const { added, existing } = handles.length ? await write("addHandles", handles) : { added: [], existing: [] };

    const parts: string[] = [];
    if (added.length) parts.push(`${added.length} compte(s) ajouté(s) : ${names(added)}.`);
    if (existing.length) parts.push(`Déjà dans la liste : ${names(existing)}.`);
    if (invalid.length) parts.push(`Comptes invalides : ${names(invalid, "")}.`);
    setReport({
      message: parts.join(" "),
      kind: invalid.length && !added.length ? "error" : added.length ? "ok" : "warn",
    });
    // Seules les entrées invalides restent dans le champ, pour être corrigées.
    setValue(invalid.join(" "));
  }

  return (
    <Panel className="mt-9">
      <h3 className="mb-4 text-2xl leading-tight">Ajouter des comptes X à bloquer</h3>
      <form className="flex gap-3 max-[560px]:flex-wrap" noValidate onSubmit={(event) => void add(event)}>
        <label htmlFor="addInput" className="sr-only">
          Comptes à ajouter
        </label>
        <Input
          id="addInput"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="@nom1 @nom2 https://x.com/nom3"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-[52px] min-w-0 flex-1 rounded-full border-line-strong bg-cream px-5 text-base shadow-none md:text-base focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-coral-deep"
        />
        <Button type="submit" variant="cta" size="lg" className="max-[560px]:flex-1">
          Ajouter
        </Button>
      </form>
      <Hint>Plusieurs comptes séparés par des espaces, au format @nom, nom ou URL de profil.</Hint>
      <p
        role="status"
        aria-live="polite"
        className={cn("mt-2 text-sm empty:hidden", report && REPORT_COLORS[report.kind])}
      >
        {report?.message}
      </p>
    </Panel>
  );
}
