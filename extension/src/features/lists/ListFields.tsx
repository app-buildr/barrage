// Éléments communs à l'accueil et à Réglages : puces de réseau, encart « Format
// attendu », adresse et choix d'un fichier.
import { useRef, type Ref } from "react";
import { Check, Info } from "lucide-react";
import { IMPORT_PREVIEW_SIZE, LIST_FILE_EXTENSIONS, LIST_MAX_ADDED_SHARE } from "@/core/config.ts";
import { plural } from "@/core/format.ts";
import { CORAL_BUTTON } from "@/ui/classes.ts";
import { Button } from "@/ui/components/button.tsx";
import { PillInput } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { AVAILABLE_NETWORKS, type NetworkId } from "../networks/networks.ts";
import type { Analysis } from "./use-list-analysis.ts";

type ChipsProps = { value: readonly NetworkId[]; onChange: (networks: NetworkId[]) => void };

/**
 * « Appliquer sur » : une puce par réseau où le blocage fonctionne. La dernière
 * puce cochée ne se décoche pas : sans réseau, une liste ne couvrirait rien.
 */
export function NetworkChips({ value, onChange }: ChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-body font-bold text-muted-foreground">Appliquer sur</span>
      {AVAILABLE_NETWORKS.map(({ id, label }) => {
        const checked = value.includes(id);
        const last = checked && value.length === 1;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={checked}
            aria-disabled={last}
            title={last ? "Une liste s'applique sur au moins un réseau." : undefined}
            onClick={() => {
              if (!last) onChange(checked ? value.filter((n) => n !== id) : [...value, id]);
            }}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-body font-bold transition-colors",
              last ? "cursor-default" : "cursor-pointer",
              checked ? "border-coral bg-coral text-white" : "border-line-strong bg-card text-ink hover:bg-cream",
            )}
          >
            {checked ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function FormatHint() {
  return (
    <aside className="rounded-step bg-sun-soft p-5 text-body text-ink">
      <div className="mb-2 flex items-center gap-3 font-bold">
        <Info className="size-5 flex-none text-coral-deep" strokeWidth={2.2} aria-hidden="true" />
        Format attendu
      </div>
      <p className="m-0">
        Les comptes séparés par des espaces, virgules, points-virgules ou retours à la ligne, avec ou sans @. Les
        adresses de profil x.com sont aussi acceptées.
      </p>
      <code className="mt-3 block overflow-x-auto rounded-icon border border-line bg-card px-4 py-3 font-mono text-sm whitespace-nowrap">
        @compte_01 @compte_02;compte_03; https://x.com/compte_04
      </code>
    </aside>
  );
}

/** À l'import d'une adresse : une liste GitHub suit son auteur, pas seulement ce qu'on a vu à l'import. */
export function AutoUpdateNotice() {
  return (
    <p className="m-0 text-body text-muted-foreground">
      Une liste GitHub se met à jour seule : ce que son auteur y ajoute est appliqué sans vous le demander, jusqu'à{" "}
      {LIST_MAX_ADDED_SHARE * 100} % de comptes en plus par semaine. Au-delà, Barrage vous demande de confirmer dans
      Réglages. N'importez que des listes dont vous connaissez l'auteur.
    </p>
  );
}

/** Aperçu d'une liste analysée, avant son activation : rien n'est encore enregistré. */
export function ListPreview({ analysis }: { analysis: Analysis }) {
  const { handles, warning } = analysis;
  const shown = handles.slice(0, IMPORT_PREVIEW_SIZE);
  return (
    <div className="rounded-step border border-line bg-card p-4 text-body text-ink">
      <p className="m-0 font-bold">
        {plural(handles.length, "compte")} à bloquer
        {handles.length > shown.length ? `, dont les ${shown.length} premiers :` : " :"}
      </p>
      <p className="mt-1 mb-0 break-words text-muted-foreground">
        {shown.map((handle) => `@${handle}`).join(", ")}
        {handles.length > shown.length ? "…" : ""}
      </p>
      {warning ? <p className="mt-2 mb-0 font-bold text-sun-soft-ink">{warning}</p> : null}
    </div>
  );
}

type UrlFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
  variant: "cta" | "outline";
  inputRef?: Ref<HTMLInputElement>;
};

/** Adresse d'une liste à analyser. La suite de l'analyse reste à l'appelant. */
export function ListUrlForm({ value, onChange, onSubmit, busy, submitLabel, variant, inputRef }: UrlFormProps) {
  return (
    <form
      className="flex gap-3 max-xs:flex-wrap"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="listUrl" className="sr-only">
        Adresse de la liste
      </label>
      <PillInput
        ref={inputRef}
        id="listUrl"
        type="url"
        placeholder="https://raw.githubusercontent.com/…/liste.txt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-card"
      />
      <Button type="submit" variant={variant} size="lg" disabled={busy || !value.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Lien « ou choisir un fichier », qui ouvre le sélecteur de fichiers. */
export function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={LIST_FILE_EXTENSIONS.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // Le même fichier peut être rechoisi.
          if (file) onFile(file);
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className={CORAL_BUTTON}>
        ou choisir un fichier
      </button>
    </>
  );
}
