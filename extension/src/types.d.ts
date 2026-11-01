// Fichiers importés par esbuild : les gabarits HTML comme texte, les feuilles
// de style regroupées dans le CSS de chaque point d'entrée.
declare module "*.html?raw" {
  const html: string;
  export default html;
}
declare module "*.css" {}
