// Gabarits des pages de partage des badges (docs/badge/<slug>/index.html) et de
// leurs images (docs/assets/og-badge-<slug>-<hash>.png, 1200×630). Sans effet de
// bord : scripts/make-badge-pages.mjs écrit les fichiers, tests/badges.test.ts
// vérifie que ceux du dépôt sont à jour. Hors du bundle de l'extension.
import { renderToStaticMarkup } from "react-dom/server";
import { REPO_URL, SITE_URL, X_ACCOUNT } from "../../core/config.ts";
import { xProfileUrl } from "../networks/networks.ts";
import { type Badge, type Palier, badgeDescription, badgePageUrl } from "./badges.ts";
import { badgeIcon } from "./icons.ts";

export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@400;500;600;700;800&display=swap";

/**
 * Polices de l'image, au format de `document.fonts.load` : la capture échoue si
 * l'une n'est pas chargée, plutôt que d'enregistrer une image en police de secours.
 */
export const IMAGE_FONTS = ['800 112px "Bricolage Grotesque"', "800 24px Inter", "700 40px Inter", "500 28px Inter"] as const;

const escape = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const icon = (palier: Palier, size?: number): string => renderToStaticMarkup(badgeIcon(palier, size));

/** « Premier compte bloqué », « 10 comptes bloqués »… */
const achievement = (palier: Palier): string => (palier === 1 ? "Premier compte bloqué" : badgeDescription(palier));

/**
 * Gabarit de l'image de partage, capturé avec une fenêtre de 1200×630 (voir
 * capture() dans le script) : html et body sont aussi fixés à cette taille.
 */
export function imageHtml(badge: Badge): string {
  const long = badge.name.length > 12;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<link href="${FONTS}" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${IMAGE_WIDTH}px; height: ${IMAGE_HEIGHT}px; overflow: hidden; }
  body { background: #f0643c; color: #fff; font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { display: grid; grid-template-columns: 1fr 400px; gap: 40px; align-items: center; height: 100%; padding: 64px 80px 64px 72px; }
  .brand { display: flex; align-items: center; gap: 18px; font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 44px; }
  .logo { position: relative; width: 66px; height: 66px; border-radius: 50%; background: #fff; }
  .logo::after { content: ""; position: absolute; left: 25%; right: 25%; top: 50%; height: 18%; transform: translateY(-50%); background: #f0643c; border-radius: 3px; }
  .tag { display: inline-block; margin-top: 44px; background: #ffd23f; color: #5a1e0a; font-weight: 800; font-size: 24px; letter-spacing: .06em; text-transform: uppercase; padding: 6px 18px; border-radius: 999px; }
  h1 { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: ${long ? 100 : 112}px; line-height: 1; letter-spacing: -.01em; margin-top: 22px; }
  .what { font-size: 40px; font-weight: 700; margin-top: 18px; }
  .sign { font-size: 28px; font-weight: 500; margin-top: 36px; white-space: nowrap; }
  .disc { width: 400px; height: 400px; border-radius: 50%; background: #fff; color: #f0643c; display: grid; place-items: center; box-shadow: 0 0 0 18px rgba(255, 255, 255, .22), 0 24px 60px rgba(120, 40, 10, .3); }
</style></head>
<body><div class="wrap">
  <div>
    <div class="brand"><span class="logo"></span>Barrage</div>
    <span class="tag">Badge débloqué</span>
    <h1>${escape(badge.name)}</h1>
    <p class="what">${escape(achievement(badge.palier))}</p>
    <p class="sign">Vos réseaux sociaux, vos règles.</p>
  </div>
  <div class="disc">${icon(badge.palier, 230)}</div>
</div></body></html>
`;
}

/**
 * Nom de l'image : le hash vient du gabarit, icône comprise. Une image inchangée
 * n'est pas recapturée, une image modifiée change de nom, ce qui oblige X à la relire.
 */
export async function imageName(badge: Badge): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(imageHtml(badge)));
  const hash = Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  return `og-badge-${badge.slug}-${hash}.png`;
}

/** Toutes les images de badge du dossier assets, quel que soit le slug. */
export const BADGE_IMAGE = /^og-badge-[a-z0-9-]+-[0-9a-f]{8}\.png$/;

/** Page du badge : ce qu'ouvre le lien du tweet, et ce que lit X pour la carte. */
export function pageHtml(badge: Badge, image: string): string {
  const url = badgePageUrl(badge);
  const imageUrl = `${SITE_URL}/assets/${image}`;
  const what = achievement(badge.palier);
  const title = `Badge ${badge.name} : ${what.toLowerCase()} avec Barrage`;
  const description = `${what} avec Barrage, qui bloque automatiquement les comptes d'une liste collaborative. Extension gratuite et open source pour Chrome, Brave et Edge.`;
  const alt = `Badge ${badge.name} de Barrage : ${what.toLowerCase()}.`;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Page générée par extension/scripts/make-badge-pages.mjs : ne pas modifier à la main. -->
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <!-- Page de partage : hors des moteurs de recherche, mais ses liens sont suivis. X la lit quand même. -->
  <meta name="robots" content="noindex, follow">
  <link rel="icon" type="image/png" href="../../assets/favicon.png">

  <!-- Partage : X lit les balises twitter:* (il ne reprend pas toujours og:*), les autres réseaux og:* -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Barrage">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="${IMAGE_WIDTH}">
  <meta property="og:image:height" content="${IMAGE_HEIGHT}">
  <meta property="og:image:alt" content="${escape(alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="${X_ACCOUNT}">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:image:alt" content="${escape(alt)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="../../style.css">
</head>
<body>

  <!-- En-tête et pied repris de docs/index.html : à garder alignés. -->
  <header class="nav">
    <div class="container nav__inner">
      <a class="brand" href="../../index.html" aria-label="Barrage, accueil">
        <span class="brand__logo" aria-hidden="true"></span>
        <span class="brand__name">Barrage</span>
      </a>
      <a class="btn btn--ink btn--sm nav__install" href="../../index.html#installation">Installer</a>
    </div>
  </header>

  <main>
    <section class="hero hero--badge">
      <div class="container hero__inner">
        <div class="hero__text">
          <p class="tag">Badge débloqué</p>
          <h1>${escape(badge.name)}</h1>
          <p class="hero__lead"><strong>${escape(what)}</strong> avec Barrage. Barrage bloque automatiquement les comptes que vous ne voulez plus voir, à partir d'une liste collaborative et open source.</p>
          <div class="hero__actions">
            <a class="btn btn--sun btn--lg btn--shadow" href="../../index.html#installation">Installer Barrage</a>
            <a class="btn btn--outline btn--lg" href="../../index.html">Découvrir Barrage</a>
          </div>
          <p class="hero__note">Gratuit et open source, pour Chrome, Brave, Edge et tout navigateur Chromium.</p>
        </div>
        <div class="badge-disc" aria-hidden="true">${icon(badge.palier)}</div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container footer__inner">
      <p class="footer__brand">
        <span class="brand__logo brand__logo--small" aria-hidden="true"></span>
        <strong>Barrage</strong>
        <span>Projet indépendant, non affilié à X, Instagram ou TikTok.</span>
      </p>
      <p class="footer__links">
        <a href="${xProfileUrl(X_ACCOUNT.replace(/^@/, ""))}" target="_blank" rel="noopener">Nous suivre : ${X_ACCOUNT}</a>
        <a href="${REPO_URL}" target="_blank" rel="noopener">Code source et liste sur GitHub</a>
      </p>
    </div>
  </footer>

  <script data-goatcounter="https://barrage.goatcounter.com/count"
          async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}
