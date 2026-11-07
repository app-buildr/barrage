// Accueil du premier lancement : choix de la liste à bloquer.
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { LIST_HOSTS_TEXT } from "@/core/config.ts";
import type { State } from "@/core/state.ts";
import { useSafeWrite } from "@/core/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { CORAL_PILL } from "@/ui/classes.ts";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Header } from "@/ui/layout/Header";
import { Panel, StatusMessage } from "@/ui/layout/Section";
import { cn } from "@/ui/lib/utils";
import { AutoUpdateNotice, FilePicker, FormatHint, ListUrlInput, NetworkChips } from "../lists/ListFields.tsx";
import { LIST_NETWORKS } from "../lists/lists.ts";
import { useListAnalysis, type Analysis } from "../lists/use-list-analysis.ts";
import type { NetworkId } from "../networks/networks.ts";

type Choice = "official" | "own";

type OptionProps = { selected: boolean; onSelect: () => void; title: ReactNode; children: ReactNode };

function Option({ selected, onSelect, title, children }: OptionProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3.5 rounded-step border p-5",
        selected ? "border-2 border-coral bg-cream" : "border-line-strong",
      )}
    >
      <input type="radio" name="list" checked={selected} onChange={onSelect} className="mt-1 size-5 accent-coral" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">{title}</span>
        <span className="mt-1 block text-[15px] text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

export function Welcome({ state }: { state: State }) {
  const [choice, setChoice] = useState<Choice>("official");
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [networks, setNetworks] = useState<NetworkId[]>([...LIST_NETWORKS]);
  const { outcome, busy, analyzeUrl, analyzeFile, reset } = useListAnalysis();
  const { error, attempt } = useSafeWrite();

  const ready = choice === "official" || analysis !== null;

  function start(): void {
    const selected = analysis && choice === "own" ? { kind: "list" as const, list: { ...analysis, networks } } : null;
    void attempt(write("completeOnboarding", selected ?? { kind: "official", networks }));
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-7 px-6 pt-12 pb-16">
      <Header
        title="Bienvenue sur Barrage"
        description="Vos réseaux sociaux, vos règles. Commençons par choisir les comptes à bloquer."
      />
      <Panel className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl leading-tight">Importez une liste de comptes</h2>
          <p className="mt-1.5 mb-0 text-[15px] text-muted-foreground">
            Barrage bloque les comptes de cette liste quand ils apparaissent dans votre fil. Vous pourrez ajouter ou
            retirer des listes plus tard, dans Réglages.
          </p>
        </div>
        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="sr-only">Liste de comptes à bloquer</legend>
          <Option
            selected={choice === "official"}
            onSelect={() => setChoice("official")}
            title={
              <>
                Liste collaborative Barrage
                <Badge className={CORAL_PILL}>Recommandée</Badge>
              </>
            }
          >
            {state.official.length} comptes, maintenue sur GitHub et relue par la communauté. Mise à jour automatique.
          </Option>
          <Option selected={choice === "own"} onSelect={() => setChoice("own")} title="Importer ma propre liste">
            Depuis un fichier hébergé sur GitHub ({LIST_HOSTS_TEXT}), ou un fichier texte (.txt ou .csv) de votre
            ordinateur.
          </Option>
        </fieldset>
        {choice === "own" ? (
          <div className="flex flex-col gap-3">
            <form
              className="flex gap-3 max-[560px]:flex-wrap"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void analyzeUrl(url).then(setAnalysis);
              }}
            >
              <ListUrlInput
                value={url}
                onChange={(value) => {
                  setUrl(value);
                  setAnalysis(null);
                  reset();
                }}
              />
              <Button type="submit" variant="outline" size="lg" disabled={busy || !url.trim()}>
                Analyser
              </Button>
            </form>
            <AutoUpdateNotice />
            <FilePicker onFile={(file) => void analyzeFile(file).then(setAnalysis)} />
            <StatusMessage kind={outcome?.kind} message={outcome?.message} />
          </div>
        ) : null}
        <FormatHint />
        <NetworkChips value={networks} onChange={setNetworks} />
      </Panel>
      <StatusMessage kind="error" message={error} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void attempt(write("completeOnboarding", { kind: "later" }))}
          className="cursor-pointer border-0 bg-transparent p-0 font-bold text-muted-foreground underline underline-offset-2 hover:text-ink"
        >
          Je le ferai plus tard
        </button>
        <Button variant="cta" size="lg" disabled={!ready} onClick={start}>
          Importer et commencer
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
