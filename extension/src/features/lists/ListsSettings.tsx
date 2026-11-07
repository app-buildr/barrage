// Carte « Listes de comptes » de Réglages : listes actives, désactivées, ajout.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { List, Pencil, Plus, Trash2 } from "lucide-react";
import { LIST_NAME_MAX, RETIRE_GRACE_MS } from "@/core/config.ts";
import type { State } from "@/core/state.ts";
import { useSafeWrite, type Attempt } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { OVERLINE } from "@/ui/classes.ts";
import { Badge } from "@/ui/components/badge.tsx";
import { Button } from "@/ui/components/button.tsx";
import { Switch } from "@/ui/components/switch.tsx";
import { Panel, PillInput, StatusMessage } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import type { NetworkId } from "../networks/networks.ts";
import { listDetails } from "./details.ts";
import { LIST_FILE_EXTENSIONS_TEXT, LIST_HOSTS_TEXT } from "./import.ts";
import { plural } from "@/core/format.ts";
import { AutoUpdateNotice, FilePicker, FormatHint, ListPreview, ListUrlForm, NetworkChips } from "./ListFields.tsx";
import { LIST_NETWORKS, OFFICIAL_ID, cleanName, listHandles, listName, type ListDef } from "./lists.ts";
import type { PendingList } from "./remote.ts";
import { useListAnalysis, type Analysis } from "./use-list-analysis.ts";

type ListProps = { list: ListDef; attempt: Attempt };

function ListName({ list, attempt }: ListProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(list.name);
  const pencil = useRef<HTMLButtonElement>(null);
  /** Fin de l'édition au clavier : le focus revient sur le crayon. */
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      pencil.current?.focus();
    }
  }, [editing]);

  /** Entrée puis perte du focus ne valident qu'une fois. */
  function finish(save: boolean): void {
    if (!editing) return;
    setEditing(false);
    const name = cleanName(value);
    if (save && name !== null && name !== list.name) void attempt(write("renameList", list.id, name));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    refocus.current = true;
    finish(event.key === "Enter");
  }

  if (editing) {
    return (
      <PillInput
        autoFocus
        aria-label={`Nouveau nom de ${list.name}`}
        maxLength={LIST_NAME_MAX}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        className="h-9 max-w-xs px-3 font-bold"
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg font-bold text-ink">{listName(list)}</span>
      {list.id === OFFICIAL_ID ? (
        <Badge variant="coral">Officielle</Badge>
      ) : (
        <Button
          ref={pencil}
          variant="ghost"
          size="icon-sm"
          aria-label={`Renommer ${list.name}`}
          title="Renommer"
          onClick={() => {
            setValue(list.name);
            setEditing(true);
          }}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

/** Confirmation en deux temps : « Annuler » ramène le focus sur le bouton de départ. */
function useConfirmation() {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!confirming && refocus.current) {
      refocus.current = false;
      trigger.current?.focus();
    }
  }, [confirming]);

  function cancel(): void {
    refocus.current = true;
    setConfirming(false);
  }

  return { confirming, trigger, ask: () => setConfirming(true), cancel };
}

function RemoveList({ list, attempt, onRemoved }: ListProps & { onRemoved: () => void }) {
  const { confirming, trigger, ask, cancel } = useConfirmation();
  const question = useId();
  if (!confirming) {
    return (
      <Button ref={trigger} variant="outline" aria-label={`Supprimer ${list.name}`} onClick={ask}>
        <Trash2 />
        Supprimer
      </Button>
    );
  }
  return (
    <div role="group" aria-labelledby={question} className="flex flex-wrap items-center gap-3">
      <span id={question} className="text-body text-ink">
        Supprimer {list.name} ? Les comptes déjà bloqués le resteront.
      </span>
      <Button
        variant="destructive"
        onClick={() =>
          void attempt(write("removeList", list.id)).then((ok) => {
            if (ok) onRemoved();
          })
        }
      >
        Supprimer
      </Button>
      <Button autoFocus variant="outline" onClick={cancel}>
        Annuler
      </Button>
    </div>
  );
}

/** Aperçu des comptes concernés par une mise à jour mise de côté. */
const sample = (handles: readonly string[]): string =>
  handles.slice(0, 10).map((h) => `@${h}`).join(", ") + (handles.length > 10 ? "…" : "");

type PendingProps = ListProps & { pending: PendingList; current: readonly string[]; onAccepted: () => void };

/** Mise à jour refusée par les gardes : dite, et acceptable si le fichier était valide. */
function PendingUpdate({ list, attempt, pending, current, onAccepted }: PendingProps) {
  const { confirming, trigger, ask, cancel } = useConfirmation();
  const question = useId();
  const { handles } = pending;
  const before = new Set(current);
  const after = new Set(handles);
  const added = handles?.filter((h) => !before.has(h)) ?? [];
  const removed = handles ? current.filter((h) => !after.has(h)) : [];
  return (
    <div className="mt-3 rounded-step bg-sun-soft p-4 text-body text-ink">
      <p className="m-0 font-bold">
        {handles ? "Mise à jour en attente de votre accord" : "Mise à jour ignorée"} : {pending.reason}.
      </p>
      {handles ? (
        <>
          <p className="mt-1 mb-0">
            {plural(added.length, "compte ajouté", "comptes ajoutés")}
            {added.length ? ` (${sample(added)})` : ""}, {plural(removed.length, "compte retiré", "comptes retirés")}
            {removed.length ? ` (${sample(removed)})` : ""}. La liste en place reste appliquée tant que vous n'acceptez pas.
          </p>
          {confirming ? (
            <div role="group" aria-labelledby={question} className="mt-3 flex flex-wrap items-center gap-3">
              <span id={question}>
                {list.id === OFFICIAL_ID
                  ? `Les comptes ajoutés seront bloqués s'ils paraissent dans votre fil. Ceux que Barrage a bloqués parmi les retirés seront débloqués d'ici ${RETIRE_GRACE_MS / 3_600_000} h.`
                  : "Les comptes ajoutés seront bloqués s'ils paraissent dans votre fil."}
              </span>
              <Button
                variant="destructive"
                onClick={() =>
                  void attempt(write("acceptPendingList", list.id)).then((ok) => {
                    if (ok) onAccepted();
                  })
                }
              >
                Confirmer
              </Button>
              <Button autoFocus variant="outline" onClick={cancel}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button
              ref={trigger}
              variant="outline"
              className="mt-3"
              aria-label={`Accepter la mise à jour de ${listName(list)}`}
              onClick={ask}
            >
              Accepter cette mise à jour
            </Button>
          )}
        </>
      ) : (
        <p className="mt-1 mb-0">La liste en place reste appliquée.</p>
      )}
    </div>
  );
}

/** Ce qui suit le focus quand une carte change de groupe ou disparaît. */
type FocusProps = {
  /** Identifiant de la liste dont l'interrupteur vient d'être actionné : sa carte est remontée dans l'autre groupe. */
  refocus: RefObject<string | null>;
  onRemoved: () => void;
};

type CardProps = ListProps &
  FocusProps & { count: number; now: number; pending?: PendingList | undefined; current: readonly string[] };

function ListCard({ list, attempt, count, now, pending, current, refocus, onRemoved }: CardProps) {
  const toggle = useRef<HTMLButtonElement>(null);
  const name = listName(list);

  useEffect(() => {
    if (refocus.current !== list.id) return;
    refocus.current = null;
    toggle.current?.focus();
  }, [refocus, list.id]);

  function setActive(active: boolean): void {
    refocus.current = list.id;
    void attempt(write("setListActive", list.id, active)).then((ok) => {
      if (!ok) refocus.current = null;
    });
  }

  return (
    <li
      className={cn(
        "rounded-step border p-5",
        list.active ? "border-line" : "border-dashed border-line-strong bg-list-off",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "grid size-11 flex-none place-items-center rounded-icon",
            list.active ? "bg-cream text-coral-deep" : "bg-cream-2 text-disabled",
          )}
        >
          <List className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <ListName list={list} attempt={attempt} />
          <p className="m-0 text-body text-muted-foreground">{listDetails(list, count, now)}</p>
        </div>
        <label className="flex flex-none cursor-pointer items-center gap-3 text-body font-bold text-muted-foreground">
          {list.active ? <span className="text-ink">Active</span> : "Désactivée"}
          <Switch ref={toggle} checked={list.active} aria-label={`Liste ${name} active`} onCheckedChange={setActive} />
        </label>
      </div>
      {list.active ? (
        <div className="mt-3">
          <NetworkChips
            list={name}
            value={list.networks}
            onChange={(networks) => void attempt(write("setListNetworks", list.id, networks))}
          />
        </div>
      ) : list.id === OFFICIAL_ID ? (
        <p className="mt-3 mb-0 pl-15 text-body text-muted-foreground max-xs:pl-0">
          Toujours disponible : la liste officielle ne peut pas être supprimée.
        </p>
      ) : (
        <div className="mt-3 pl-15 max-xs:pl-0">
          <RemoveList list={list} attempt={attempt} onRemoved={onRemoved} />
        </div>
      )}
      {pending ? (
        <PendingUpdate
          list={list}
          attempt={attempt}
          pending={pending}
          current={current}
          onAccepted={() => toggle.current?.focus()}
        />
      ) : null}
    </li>
  );
}

/**
 * Analyse, aperçu, puis activation sur un clic : rien n'est enregistré avant.
 * Reste ouvert après un import, d'autres listes peuvent suivre.
 */
function NewListPanel({ attempt }: { attempt: Attempt }) {
  const [url, setUrl] = useState("");
  const [networks, setNetworks] = useState<NetworkId[]>([...LIST_NETWORKS]);
  const { outcome, analysis, busy, analyzeUrl, analyzeFile, reset } = useListAnalysis();
  const urlInput = useRef<HTMLInputElement>(null);

  /** Les boutons qui suivent l'aperçu disparaissent avec lui : le focus revient sur l'adresse. */
  function dismiss(): void {
    reset();
    urlInput.current?.focus();
  }

  async function activate(ready: Analysis): Promise<void> {
    const { warning: _warning, ...list } = ready;
    if (!(await attempt(write("addList", { ...list, networks })))) return;
    setUrl("");
    dismiss();
  }

  return (
    <div className="mt-5 flex flex-col gap-4 rounded-step bg-cream p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 flex-none place-items-center rounded-icon bg-card text-coral-deep">
          <Plus className="size-5" aria-hidden="true" />
        </span>
        <h3 className="font-sans text-lg font-bold tracking-normal">Nouvelle liste</h3>
      </div>
      <p className="m-0 text-body text-muted-foreground">
        Collez l'adresse d'une liste hébergée sur GitHub ({LIST_HOSTS_TEXT}), ou importez un fichier texte (
        {LIST_FILE_EXTENSIONS_TEXT}) depuis votre ordinateur. Les autres sites ne sont pas acceptés.
      </p>
      <FormatHint />
      <AutoUpdateNotice />
      <ListUrlForm
        value={url}
        onChange={(value) => {
          setUrl(value);
          reset();
        }}
        onSubmit={() => void analyzeUrl(url)}
        inputRef={urlInput}
        busy={busy}
        submitLabel="Importer"
        variant="cta"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkChips value={networks} onChange={setNetworks} />
        <FilePicker busy={busy} onFile={(file) => void analyzeFile(file)} />
      </div>
      <StatusMessage kind={outcome?.kind} message={outcome?.message} />
      {analysis ? (
        <>
          <ListPreview analysis={analysis} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="cta" onClick={() => void activate(analysis)}>
              Activer cette liste
            </Button>
            <Button variant="outline" onClick={dismiss}>
              Annuler
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

type GroupProps = FocusProps & { title: string; lists: readonly ListDef[]; state: State; attempt: Attempt };

function Group({ title, lists, state, attempt, refocus, onRemoved }: GroupProps) {
  if (!lists.length) return null;
  const now = Date.now();
  return (
    <>
      <h3 className={cn(OVERLINE, "mt-5 mb-2.5 font-sans text-sm text-muted-foreground")}>
        {title} ({lists.length})
      </h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {lists.map((list) => {
          const current = listHandles(list, state.official);
          return (
            <ListCard
              key={list.id}
              list={list}
              attempt={attempt}
              count={current.length}
              now={now}
              pending={state.listGuards[list.id]?.pending}
              current={current}
              refocus={refocus}
              onRemoved={onRemoved}
            />
          );
        })}
      </ul>
    </>
  );
}

export function ListsSettings({ state }: { state: State }) {
  const [adding, setAdding] = useState(false);
  const { error, attempt } = useSafeWrite();
  const refocus = useRef<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focus = { refocus, onRemoved: () => addButton.current?.focus() };
  return (
    <section>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2>Listes de comptes</h2>
          <Button ref={addButton} aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Plus />
            Ajouter une liste
          </Button>
        </div>
        <p className="m-0 text-body text-muted-foreground">
          Barrage bloque les comptes de toutes les listes actives. Choisissez pour chacune les réseaux sur lesquels elle
          s'applique. Une liste active se désactive, elle ne se supprime pas. Désactiver ou supprimer une liste ne
          débloque pas les comptes déjà bloqués.
        </p>
        <Group title="Actives" lists={state.lists.filter((l) => l.active)} state={state} attempt={attempt} {...focus} />
        <Group title="Désactivées" lists={state.lists.filter((l) => !l.active)} state={state} attempt={attempt} {...focus} />
        {adding ? <NewListPanel attempt={attempt} /> : null}
        <StatusMessage kind="error" message={error} className="mt-3" />
      </Panel>
    </section>
  );
}
