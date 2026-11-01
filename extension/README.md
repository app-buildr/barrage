# Barrage

> Barrage bloque automatiquement sur vos réseaux sociaux les comptes d'une liste collaborative et open source.

## Développement

React, Tailwind CSS v4 et shadcn/ui, construits avec Vite.

```sh
npm install
npm run build      # dist/, à charger non empaquetée dans chrome://extensions
npm run watch      # reconstruit à chaque modification
npm test           # tests de la logique (node --test)
npm run typecheck
```

- `src/entries/` : points d'entrée (service worker, content script x.com, page d'options), assemblage seulement.
- `src/features/<fonctionnalité>/` : composants `.tsx` pour l'affichage, fichiers `.ts` pour la logique pure et testée.
- `src/ui/components/` : composants shadcn/ui (`npx shadcn@latest add <composant>`), habillés du thème Corail de `src/ui/globals.css`.
- Les notifications sur x.com sont rendues dans un Shadow DOM fermé (`features/notifications/mount.tsx`), avec la police système. Le content script remplace React par Preact (`preact/compat`, voir `vite.config.ts`) pour rester léger : n'y utiliser que l'API React courante.
