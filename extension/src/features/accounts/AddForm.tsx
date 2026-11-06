// Formulaire « Ajouter des comptes » : un ou plusieurs comptes séparés par
// des espaces, virgules ou points-virgules, ajoutés à « Ma liste perso ».
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/components/button";
import { Input } from "@/ui/components/input";
import { PILL_INPUT } from "@/ui/classes.ts";
import { Hint, Panel, StatusMessage, type StatusKind } from "@/ui/layout/Section";
import { cn } from "@/ui/lib/utils";
import { plural } from "@/core/format.ts";
import { WRITE_ERROR } from "@/core/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { parseInput } from "../lists/handles.ts";

/** « @a, @b et @c », tronqué au-delà de quelques noms. */
function names(handles: readonly string[], prefix = "@"): string {
  const shown = handles.slice(0, 5).map((h) => prefix + h);
  const more = handles.length - shown.length;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}` : (shown[0] ?? "");
  return more > 0 ? `${shown.join(", ")} et ${plural(more, "autre")}` : list;
}

type Report = { message: string; kind: StatusKind };

export function AddForm() {
  const [value, setValue] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    const { handles, invalid } = parseInput(value);
    if (!handles.length && !invalid.length) return;
    let reply = { added: [] as string[], existing: [] as string[], inactive: false };
    try {
      if (handles.length) reply = await write("addHandles", handles);
    } catch {
      setReport({ message: WRITE_ERROR, kind: "error" });
      return;
    }
    const { added, existing, inactive } = reply;

    const parts: string[] = [];
    if (added.length) parts.push(`${plural(added.length, "compte ajouté", "comptes ajoutés")} : ${names(added)}.`);
    if (existing.length) parts.push(`Déjà dans la liste : ${names(existing)}.`);
    if (invalid.length) parts.push(`Comptes invalides : ${names(invalid, "")}.`);
    if (added.length && inactive) {
      parts.push("Ma liste perso est désactivée : activez-la dans Réglages pour bloquer ces comptes.");
    }
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
          className={cn(PILL_INPUT, "bg-cream")}
        />
        <Button type="submit" variant="cta" size="lg" className="max-[560px]:flex-1">
          Ajouter
        </Button>
      </form>
      <Hint>Plusieurs comptes séparés par des espaces, au format @nom, nom ou URL de profil.</Hint>
      <StatusMessage kind={report?.kind} message={report?.message} className="mt-2" />
    </Panel>
  );
}
