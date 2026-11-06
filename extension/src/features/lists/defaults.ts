// Liste collaborative intégrée au build, lue dans lists/x.json à la racine du
// dépôt : c'est le même fichier que Barrage charge depuis GitHub. Elle sert tant
// qu'aucune liste n'a été reçue, voir core/state.ts. Identifiants en minuscules,
// comme ceux que produit parseHandle.
import x from "../../../../lists/x.json" with { type: "json" };

export const DEFAULT_HANDLES: readonly string[] = x;
