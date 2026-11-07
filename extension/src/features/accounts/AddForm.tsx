// Formulaire « Ajouter des comptes » : un ou plusieurs comptes séparés par
// des espaces, virgules ou points-virgules, ajoutés à « Ma liste perso ».
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/components/button.tsx";
import { Hint, Panel, PillInput, StatusMessage, type StatusReport } from "@/ui/layout/Section.tsx";
import { WRITE_ERROR } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { parseInput } from "../lists/handles.ts";
import { addReport } from "./add-report.ts";
import type { AddResult } from "../lists/store.ts";

export function AddForm() {
  const [value, setValue] = useState("");
  const [report, setReport] = useState<StatusReport | null>(null);

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
      <form className="flex gap-3 max-xs:flex-wrap" noValidate onSubmit={(event) => void add(event)}>
        <label htmlFor="addInput" className="sr-only">
          Comptes à ajouter
        </label>
        <PillInput
          id="addInput"
          type="text"
          placeholder="@nom1 @nom2 https://x.com/nom3"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="bg-cream"
        />
        <Button type="submit" variant="cta" size="lg" className="max-xs:flex-1">
          Ajouter
        </Button>
      </form>
      <Hint>Plusieurs comptes séparés par des espaces, au format @nom, nom ou URL de profil.</Hint>
      <StatusMessage kind={report?.kind} message={report?.message} className="mt-2" />
    </Panel>
  );
}
