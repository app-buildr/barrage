# Barrage

> Barrage bloque automatiquement sur vos réseaux sociaux les comptes d'une liste collaborative et open source.

## Développement

React, Tailwind CSS v4 et shadcn/ui, construits avec Vite.

```sh
npm install
npm run build      # dist/, à charger non empaquetée dans chrome://extensions
npm run watch      # reconstruit à chaque modification
npm test           # tests de la logique (node --test)
npm run typecheck  # src/ (navigateur) et vite.config.ts (Node, tsconfig.node.json)
```

- `src/entries/` : points d'entrée (service worker, content script x.com, page d'options), assemblage seulement.
- `src/features/<fonctionnalité>/` : composants `.tsx` pour l'affichage, fichiers `.ts` pour la logique pure et testée.
- `src/features/lists/` : listes de comptes (`lists.ts`), import (`import.ts`), synchronisation et migration depuis la 1.3.0 (`migrate.ts`). `State.handles` est la liste effective de X : l'union des listes actives.
- `src/features/badges/` : paliers, attribution et partage, par compte X.
- `src/ui/components/` : composants shadcn/ui (`npx shadcn@latest add <composant>`), habillés du thème Corail de `src/ui/globals.css`. La palette (`src/ui/palette.css`) est partagée avec la notification de x.com.
- Les notifications sur x.com sont rendues dans un Shadow DOM fermé (`features/notifications/mount.tsx`), avec la police système ; Chrome y ignorant les `@property`, `mount.tsx` redonne leur valeur initiale aux variables `--tw-*`. Le content script remplace React par Preact (`preact/compat`, voir `vite.config.ts`) pour rester léger : n'y utiliser que l'API React courante.
