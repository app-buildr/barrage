// Service worker : assemblage seulement, la logique vit dans features/.
import { syncAllBadges } from "../features/badges/store.ts";
import { watchActionBadge } from "../features/blocking/action-badge.ts";
import { repairInheritedBlocks } from "../features/blocking/store.ts";
import { migrate } from "../features/lists/migrate.ts";
import { syncBundled } from "../features/lists/store.ts";
import { refreshLists, syncLists } from "../features/lists/sync.ts";
import { servePages } from "../features/onboarding/open.ts";
import { checkLatestVersion } from "../features/updates/check.ts";
import { serial, serveWrites } from "../core/writer.ts";

const logFailure = (err: unknown): void => console.error("[Barrage]", err);

/** Écriture à la suite des autres : un échec est journalisé, la suite s'applique quand même. */
const inOrder = (task: () => Promise<void>): Promise<void> => serial(task).catch(logFailure);

/** Listes en ligne et dernière version de l'extension, relevées ensemble. */
const refresh = (): Promise<unknown> => Promise.all([refreshLists(), checkLatestVersion()]).catch(logFailure);

const schedule = syncLists(refresh);

// À chaque démarrage, avant tout le reste : une mise à jour dont l'événement a
// été manqué est rattrapée d'après les données, voir migrate.
void inOrder(() => migrate());

// Seul écouteur qui touche à l'état, pour que l'ordre se lise ici : migration,
// réparation d'une mise à jour, badges, liste intégrée, puis premier téléchargement.
chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason === "update") {
    void inOrder(() => migrate(previousVersion));
    void inOrder(() => repairInheritedBlocks(previousVersion));
  }
  void inOrder(syncAllBadges);
  void inOrder(syncBundled).finally(schedule);
});
chrome.runtime.onStartup.addListener(schedule);

servePages();
serveWrites();
watchActionBadge();
