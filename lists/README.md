# Listes de comptes

Un fichier par réseau. Tout commit sur `main` part vers les installations en 6 h au plus : ces fichiers ne se modifient que par pull request, et la CI les contrôle (`extension/scripts/check-repo.mjs`).

Seul `x.json` est lu par l'extension aujourd'hui. Les autres fichiers restent vides tant que Barrage ne sait pas bloquer sur ces réseaux.

## Format

Un tableau JSON de chaînes, sans enveloppe : une autre forme serait refusée par toutes les versions déjà installées, qui resteraient figées sur leur dernière liste sans message d'erreur.

Dans chaque fichier, les entrées sont normalisées, uniques et triées par ordre de code (chiffres, puis `_`, puis lettres minuscules), sans `@` ni URL, sauf pour YouTube.

| Fichier | Forme d'une entrée |
| --- | --- |
| `x.json` | 1 à 15 caractères parmi `a-z`, `0-9` et `_`, en minuscules |
| `instagram.json` | 1 à 30 caractères parmi `a-z`, `0-9`, `_` et `.` |
| `tiktok.json` | 2 à 24 caractères parmi `a-z`, `0-9`, `_` et `.` |
| `facebook.json` | 5 à 50 caractères parmi `a-z`, `0-9` et `.` |
| `youtube.json` | Identifiant de chaîne `UC…` (24 caractères, casse conservée) ou `@nom` en minuscules (3 à 30 caractères parmi `a-z`, `0-9`, `_`, `.` et `-`) |

## Proposer un ajout ou un retrait

1. Ouvrez une pull request qui modifie le fichier du réseau, en respectant le tri. Dites pourquoi le compte doit entrer dans la liste ou en sortir.
2. Depuis `extension/`, après `npm ci` et `npm run build`, `npm run check` applique les contrôles de la CI.
3. La pull request est relue, puis fusionnée.

Pour demander le retrait de votre propre compte sans passer par GitHub, voir le [README](../README.md#demander-un-retrait-de-la-liste).

## Ce que la CI refuse

- un fichier qui n'est pas un tableau de chaînes, ou un fichier sans réseau connu ;
- une entrée invalide, un doublon, un tri non respecté ;
- une liste X vide, ou plus longue que `LIST_MAX_SIZE` ;
- une différence avec `main` que l'extension refuserait : plus de `LIST_MAX_REMOVED_SHARE` (10 %) de retraits d'un coup ;
- de même, plus de `LIST_MAX_ADDED_SHARE` (25 %) d'ajouts d'un coup.

Jusqu'à `LIST_GUARD_FLOOR` comptes (5), un ajout ou un retrait passe toujours. Ces seuils sont dans `extension/src/core/config.ts`, et le script les importe.

## Revenir en arrière

Une liste fusionnée par erreur se corrige par une nouvelle pull request, en général un `git revert` du commit fautif. Le push direct sur `main` n'est pas possible.

Le retour arrière passe par les mêmes seuils que le reste. Annuler un ajout massif est un retrait massif : au-delà de `LIST_MAX_REMOVED_SHARE`, la CI le refuse. Il faut alors redescendre par paliers, une pull request par palier, chacun sous le seuil.

L'extension, elle, compare chaque liste reçue à une référence renouvelée tous les 7 jours (`LIST_BASELINE_MS`), pas à la liste précédente. Un retour vers cette référence passe toujours. Des retraits enchaînés qui dépassent le seuil par rapport à elle sont mis de côté : la liste en place reste, et la mise à jour attend une confirmation dans les options.

Les comptes débloqués à cause d'une liste erronée ne sont rebloqués que s'ils réapparaissent dans le fil.
