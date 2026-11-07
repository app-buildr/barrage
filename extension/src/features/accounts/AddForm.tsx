// Formulaire « Ajouter des comptes » : un ou plusieurs comptes séparés par
// des espaces, virgules ou points-virgules, ajoutés à « Ma liste perso ».
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/components/button.tsx";
import { Input } from "@/ui/components/input.tsx";
import { PILL_INPUT } from "@/ui/classes.ts";
import { Hint, Panel, StatusMessage } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { WRITE_ERROR } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { parseInput } from "../lists/handles.ts";
import { addReport, type AddReport } from "./add-report.ts";
import type { AddResult } from "./store.ts";

export function AddForm() {
  const [value, setValue] = useState("");
  const [report, setReport] = useState<AddReport | null>(null);

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    const { handles, invalid } = parseInput(value);
    if (!handles.length && !invalid.length) return;
    let reply: AddResult = { added: [], existing: [], inactiveList: null };
    try {
      if (handles.length) reply = await write("addHandles", handles);
    } catch {
      setReport({ message: WRITE_ERROR, kind: "error" });
      return;
    }
    setReport(addReport(reply, invalid));
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
