// Liste collaborative intégrée au build, lue dans lists/x.json à la racine du
// dépôt : c'est le même fichier que Barrage charge depuis GitHub. Elle sert tant
// qu'aucune liste n'a été reçue. Service worker seulement : il la copie sous
// `bundled` à chaque démarrage, voir syncBundled, pour ne pas la charger dans
// chaque onglet x.com. Identifiants en minuscules, comme ceux que produit parseHandle.
import x from "../../../../lists/x.json" with { type: "json" };

export const DEFAULT_HANDLES: readonly string[] = x;
