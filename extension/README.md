# Barrage

> Barrage bloque automatiquement sur vos réseaux sociaux les comptes d'une liste collaborative et open source.

## Développement

React, Tailwind CSS v4 et shadcn/ui, construits avec Vite. Node 22.18 ou plus récent est requis (24 dans `.nvmrc`) : les tests et `build.mjs` exécutent du TypeScript sans étape de compilation.

```sh
npm ci
npm run build            # dist/, à charger non empaquetée dans chrome://extensions
npm run watch            # reconstruit à chaque modification
npm test                 # tests de la logique et des scripts (node --test)
npm run lint             # Biome : imports et variables inutilisés, règles des hooks
npm run typecheck        # src/ (navigateur) et vite.config.ts (Node, tsconfig.node.json)
npm run typecheck:tests  # src/ et tests/
npm run check            # après le build : listes, versions, manifest et dist/
```

La CI (`.github/workflows/ci.yml`) lance ces commandes sur chaque pull request. Le format des listes et les procédures d'ajout, de retrait et de retour arrière sont dans [`lists/README.md`](../lists/README.md).

- Imports : `@/` est réservé aux `.tsx` et aux hooks de la page d'options. La logique lue par `node --test` et le content script utilisent des chemins relatifs : Node ne connaît pas cet alias. L'extension du fichier est toujours écrite, sauf dans `src/ui/components/`, généré par shadcn/ui.
- `src/entries/` : points d'entrée (service worker, content script x.com, page d'options), assemblage seulement.
- `src/features/<fonctionnalité>/` : composants `.tsx` pour l'affichage, et trois sortes de fichiers `.ts` : des modèles purs et testés (`queue.ts`, `outcome.ts`, `status.ts`), des stores (`store.ts`) et des orchestrateurs liés à une surface, qui font des entrées-sorties (`runner.ts`, `timeline.ts`, `watch.ts`, `sync.ts`).
- `src/features/lists/` : listes de comptes (`lists.ts`), import (`import.ts`), synchronisation et migration depuis la 1.3.0 (`migrate.ts`). `State.handles` est la liste effective de X : l'union des listes actives.
- `src/features/badges/` : paliers, attribution et partage, par compte X.
- `src/ui/components/` : composants shadcn/ui (`npx shadcn@latest add <composant>`), habillés du thème Corail de `src/ui/globals.css`. La palette (`src/ui/palette.css`) est partagée avec la notification de x.com.
- Les notifications sur x.com sont rendues dans un Shadow DOM fermé (`features/notifications/mount.tsx`), avec la police système ; Chrome y ignorant les `@property`, `mount.tsx` redonne leur valeur initiale aux variables `--tw-*`. Le content script remplace React par Preact (`preact/compat`, voir `vite.config.ts`) pour rester léger : n'y utiliser que l'API React courante.
- `scripts/` : `check-repo.mjs` (contrôle de la CI), `split-lists.mjs` (génère `lists/` depuis `resources/`, hors dépôt, et n'écrit qu'avec `--write`), `make-icons.mjs` (régénère `icons/`).

## Publier une version

1. Monter la version dans `package.json` et `manifest.json`, avec `npm version --no-git-tag-version` pour le premier et à la main pour le second. `npm run check` refuse un écart.
2. Fusionner sur `main` par pull request.
3. Pousser le tag `vX.Y.Z` sur le commit de `main`. `.github/workflows/release.yml` relance les contrôles, vérifie que le tag correspond au manifest et publie la release avec `barrage.zip`.

Le nom de l'asset ne doit pas changer : les liens du README et du site pointent sur `releases/latest/download/barrage.zip`. Le zip n'est pas versionné.
