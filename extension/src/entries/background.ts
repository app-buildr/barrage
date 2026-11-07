// Service worker : assemblage seulement, la logique vit dans features/.
import { syncAllBadges } from "../features/badges/store.ts";
import { watchBadge } from "../features/blocking/badge.ts";
import { repairInheritedBlocks } from "../features/blocking/store.ts";
import { migrate } from "../features/lists/migrate.ts";
import { syncLists } from "../features/lists/sync.ts";
import { servePages } from "../features/onboarding/open.ts";
import { serial, serveWrites } from "../core/writer.ts";

const runMigration = (previousVersion?: string): Promise<void> =>
  serial(() => migrate(previousVersion)).catch((err: unknown) => console.error("[Barrage] migration échouée :", err));

// À chaque démarrage, avant tout le reste : une mise à jour dont l'événement a
// été manqué est rattrapée d'après les données, voir migrate.
void runMigration();
// Avant syncLists : la migration passe avant toute synchronisation des listes.
chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason === "update") void runMigration(previousVersion);
  // Une mise à jour de l'extension répare l'état laissé par la 1.1.0.
  if (reason === "update") void serial(() => repairInheritedBlocks(previousVersion));
  void serial(syncAllBadges);
});
servePages();
serveWrites();
watchBadge();
syncLists();
