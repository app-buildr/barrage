// Carte « Mise à jour de vos listes », en tête de l'onglet Comptes : les
// comptes qu'une mise à jour a retirés d'une liste ou y a ajoutés, jusqu'à la
// validation de l'utilisateur. Trois groupes, voir updateGroups :
// - retirés, bloqués par Barrage : cochés, ils restent bloqués ;
// - retirés, pas encore bloqués : cochés, ils rejoignent « Ma liste perso » ;
// - ajoutés : pour information, sans case ; l'interrupteur du tableau reste
//   le moyen d'en écarter un.
//
// La recommandation suit la mise à jour : débloquer les retirés que Barrage a
// bloqués, ne plus bloquer les autres. Elle ne part qu'une fois toutes les cases
// décochées, pour qu'un clic ne défasse pas un choix ; « Appliquer mes choix »
// garde les comptes cochés, voir updateChoice. Sans retrait, « J'ai compris ».
// Garder un compte désactivé le réactive, voir resolveListUpdate.
// Le pseudo mène au profil, ouvert dans un nouvel onglet : la case se coche par
// un clic sur elle ou sur la liste d'origine.
import { memo, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ListRestart } from "lucide-react";
import { ACCOUNT_PAGE } from "@/core/config.ts";
import { diffSummary, formatCount, plural } from "@/core/format.ts";
import { formatShortDate } from "@/core/intl.ts";
import type { State } from "@/core/state.ts";
import { write } from "@/core/write.ts";
import { Button } from "@/ui/components/button.tsx";
import { Checkbox } from "@/ui/components/checkbox.tsx";
import { Panel, StatusMessage } from "@/ui/layout/Section.tsx";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { MANUAL_ID, MANUAL_NAME, coversNetwork } from "../lists/lists.ts";
import { ENGINE_NETWORK, NETWORKS, type Network } from "../networks/networks.ts";
import { StatusLabel } from "./AccountRow.tsx";
import { moreLabel, shownCount } from "./filter.ts";
import { updateChoice, updateGroups, type UpdateChoice, type UpdateLine } from "./list-update.ts";
import { ProfileLink } from "./ProfileLink.tsx";

// Les comptes des listes sont ceux de X, seul réseau pris en charge.
const NETWORK = NETWORKS.find((network) => network.id === ENGINE_NETWORK);

type Props = {
  state: State;
  /** Un onglet x.com connecté peut traiter la file : l'état des comptes en dépend, comme dans le tableau. */
  working: boolean;
};

export function ListUpdateReview({ state, working }: Props) {
  // Comptes retirés cochés, à garder, dans l'un ou l'autre groupe.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { error, attempt } = useSafeWrite();
  const title = useId();
  const groups = useMemo(() => updateGroups(state, working), [state, working]);
  const removed = groups.blocked.length + groups.notBlocked.length;
  if ((!removed && !groups.added.length) || !NETWORK) return null;

  const { at } = groups;
  const manual = state.lists.find((list) => list.id === MANUAL_ID);
  // Sans « Ma liste perso », le premier compte suivi la crée, active sur X.
  const canFollow = !manual || coversNetwork(manual, ENGINE_NETWORK);
  const manualName = manual?.name ?? MANUAL_NAME;
  // Seules comptent les cases visibles : un groupe qui n'est plus cochable
  // (« Ma liste perso » désactivée entre-temps) ne garde rien.
  const selectable = canFollow ? [...groups.blocked, ...groups.notBlocked] : groups.blocked;
  const keptHandles = new Set(selectable.filter((line) => checked.has(line.handle)).map((line) => line.handle));
  const kept = keptHandles.size;

  function apply({ unblock, keep, follow }: UpdateChoice): void {
    setBusy(true);
    const acknowledged = groups.added.map((line) => line.handle);
    void attempt(write("resolveListUpdate", state.account, unblock, keep, follow, acknowledged)).then((ok) => {
      setBusy(false);
      if (ok) setChecked(new Set());
    });
  }

  const selection = { checked, setChecked, busy };

  return (
    <Panel role="region" aria-labelledby={title} className="mb-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 flex-none place-content-center rounded-icon bg-sun-soft text-coral-deep">
          <ListRestart className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="grid min-w-0">
          <h3 id={title} className="m-0 text-xl">
            Mise à jour de vos listes
          </h3>
          <span className="text-label text-muted-foreground">
            {diffSummary(removed, groups.added.length)}
            {at === null ? "" : ` (${formatShortDate(at)})`}
          </span>
        </div>
      </div>

      {removed ? (
        <p className="mt-0 mb-4 text-body text-muted-foreground">
          Barrage vous recommande de suivre la liste : débloquer les comptes retirés qu'il avait bloqués, et ne plus
          bloquer les autres. Rien n'est fait sans votre accord : appliquez la recommandation, ou cochez d'abord les
          comptes que vous voulez garder.
        </p>
      ) : null}

      {groups.blocked.length ? (
        <Group
          network={NETWORK}
          selection={selection}
          title={`Retirés, bloqués par Barrage (${formatCount(groups.blocked.length)})`}
          hint="Ils sont toujours bloqués sur X. Cochez ceux que vous voulez garder bloqués : un compte désactivé est alors réactivé."
          lines={groups.blocked}
          checkLabel={(handle) => `Garder @${handle} bloqué`}
          verb="Retiré de"
        />
      ) : null}

      {groups.notBlocked.length ? (
        <Group
          network={NETWORK}
          {...(canFollow ? { selection } : {})}
          title={`Retirés, pas encore bloqués (${formatCount(groups.notBlocked.length)})`}
          hint={
            canFollow
              ? `Cochez ceux que vous voulez continuer à bloquer : ils seront ajoutés à ${manualName}, et réactivés s'ils étaient désactivés.`
              : `Barrage ne les bloquera plus. Pour en garder, activez ${manualName} sur X dans Réglages : vous pourrez alors les cocher.`
          }
          lines={groups.notBlocked}
          checkLabel={(handle) => `Continuer à bloquer @${handle}`}
          verb="Retiré de"
        />
      ) : null}

      {groups.added.length ? (
        <Group
          network={NETWORK}
          title={`Ajoutés (${formatCount(groups.added.length)})`}
          hint="Ces comptes ont été ajoutés à vos listes. Barrage les bloquera automatiquement s'ils apparaissent dans votre fil. Vous gardez la main : pour ne pas bloquer un compte, désactivez son interrupteur Blocage automatique dans le tableau ci-dessous."
          lines={groups.added}
          verb="Ajouté à"
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {removed ? (
          <>
            <Button
              disabled={busy || kept > 0}
              title={kept > 0 ? "Des comptes sont cochés : appliquez vos choix, ou décochez-les." : undefined}
              onClick={() => apply(updateChoice(groups))}
            >
              Appliquer la recommandation
            </Button>
            <Button
              variant="outline"
              disabled={busy || kept === 0}
              onClick={() => apply(updateChoice(groups, keptHandles))}
            >
              Appliquer mes choix ({plural(kept, "gardé")})
            </Button>
          </>
        ) : (
          <Button disabled={busy} onClick={() => apply(updateChoice(groups))}>
            J'ai compris
          </Button>
        )}
      </div>
      <StatusMessage kind="error" message={error} className="mt-3" />
    </Panel>
  );
}

type Selection = {
  checked: ReadonlySet<string>;
  setChecked: Dispatch<SetStateAction<ReadonlySet<string>>>;
  busy: boolean;
};

type GroupProps = {
  network: Network;
  title: string;
  hint: string;
  lines: readonly UpdateLine[];
  /** « Retiré de » ou « Ajouté à », suivi du nom de la liste. */
  verb: string;
  /** Sans sélection, le groupe est informatif : pas de case. */
  selection?: Selection;
  /** Nom accessible de la case d'un compte : ce que cocher fera. */
  checkLabel?: (handle: string) => string;
};

/**
 * Un groupe de la carte : titre, consigne, comptes, à cocher ou non. La liste
 * défile dans sa propre zone, en-tête « Tout cocher » fixé en haut ; la zone
 * prend le focus clavier pour défiler aux flèches. Les lignes sont montées par
 * pages de ACCOUNT_PAGE, et seules celles qui changent sont redessinées.
 */
function Group({ network, title, hint, lines, verb, selection, checkLabel }: GroupProps) {
  const heading = useId();
  const rowId = useId();
  const [limit, setLimit] = useState(ACCOUNT_PAGE);
  const handles = lines.map((line) => line.handle);
  const selected = selection ? handles.filter((h) => selection.checked.has(h)).length : 0;
  const all = selected === handles.length ? true : selected === 0 ? false : "indeterminate";
  const more = moreLabel(lines.length, limit);

  // D'après la sélection courante : une ligne mémoïsée garde la fonction de son dernier rendu.
  function update(targets: readonly string[], on: boolean): void {
    selection?.setChecked((current) => {
      const next = new Set(current);
      for (const handle of targets) {
        if (on) next.add(handle);
        else next.delete(handle);
      }
      return next;
    });
  }

  return (
    <section aria-labelledby={heading} className="mt-6 first-of-type:mt-0">
      <h4 id={heading} className="m-0 text-base font-bold text-ink">
        {title}
      </h4>
      <p className="mt-1 mb-3 text-body text-muted-foreground">{hint}</p>
      <div
        tabIndex={0}
        aria-labelledby={heading}
        role="group"
        className="max-h-[26rem] overflow-y-auto overscroll-contain rounded-step border border-line"
      >
        {selection ? (
          <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-4 border-b border-line bg-cream px-5 py-3 text-label font-bold text-ink">
            <Checkbox checked={all} disabled={selection.busy} onCheckedChange={(on) => update(handles, on === true)} />
            <span className="flex-1">Tout cocher / tout décocher</span>
            <span aria-live="polite">
              {formatCount(selected)} sur {formatCount(handles.length)}
            </span>
          </label>
        ) : null}
        <ul className="m-0 list-none p-0">
          {lines.slice(0, limit).map((line) => (
            <Row
              key={line.handle}
              network={network}
              line={line}
              verb={verb}
              id={`${rowId}-${line.handle}`}
              checkLabel={selection ? checkLabel?.(line.handle) : undefined}
              checked={selection?.checked.has(line.handle) ?? false}
              busy={selection?.busy ?? false}
              onToggle={selection ? update : undefined}
            />
          ))}
        </ul>
        {more ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => setLimit(limit + ACCOUNT_PAGE)}>
              {more}
            </Button>
            <span className="text-label text-muted-foreground">{shownCount(lines.length, limit)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

type RowProps = {
  network: Network;
  line: UpdateLine;
  verb: string;
  id: string;
  /** Absent : ligne informative, sans case. */
  checkLabel: string | undefined;
  checked: boolean;
  busy: boolean;
  onToggle: ((targets: readonly string[], on: boolean) => void) | undefined;
};

/** Ce qu'affiche une ligne : seule une ligne dont l'un change est redessinée. */
const rowKey = ({ line, checkLabel, checked, busy }: RowProps) =>
  JSON.stringify([line.handle, line.from, line.status, checkLabel, checked, busy]);

const Row = memo(
  function Row({ network, line, verb, id, checkLabel, checked, busy, onToggle }: RowProps) {
    const selectable = checkLabel !== undefined && onToggle !== undefined;
    return (
      <li className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
        {selectable ? (
          <Checkbox
            id={id}
            aria-label={checkLabel}
            checked={checked}
            disabled={busy}
            onCheckedChange={(on) => onToggle([line.handle], on === true)}
          />
        ) : null}
        <span className="grid min-w-0 flex-1">
          <ProfileLink
            network={network}
            handle={line.handle}
            className="w-fit max-w-full truncate text-base font-bold text-ink underline underline-offset-2"
          />
          {selectable ? (
            <label htmlFor={id} className="cursor-pointer text-label text-muted-foreground">
              {verb} {line.from}
            </label>
          ) : (
            <span className="text-label text-muted-foreground">
              {verb} {line.from}
            </span>
          )}
        </span>
        <span className="text-right">
          <StatusLabel status={line.status} />
        </span>
      </li>
    );
  },
  (before, after) => rowKey(before) === rowKey(after),
);
