// Bandeau en haut des options quand une version plus récente de Barrage est
// publiée, avec le lien vers le guide de mise à jour du site.
import { Download } from "lucide-react";
import { UPDATE_GUIDE_URL } from "@/core/config.ts";
import { updateAvailable } from "./version.ts";

export function UpdateBanner({ latestVersion }: { latestVersion: string | null }) {
  if (!updateAvailable(latestVersion)) return null;
  const installed = chrome.runtime.getManifest().version;
  return (
    <section
      role="status"
      className="flex items-center gap-3 rounded-step bg-sun-soft px-5 py-4 text-ink max-[560px]:flex-wrap"
    >
      <Download className="size-5 flex-none text-coral-deep" strokeWidth={2.2} aria-hidden="true" />
      <div className="grid flex-1 gap-0.5 text-[15px]">
        <strong className="text-base text-sun-soft-ink">Nouvelle version de Barrage disponible</strong>
        <span>
          Version {latestVersion} publiée, vous avez la {installed}.
        </span>
      </div>
      <a href={UPDATE_GUIDE_URL} target="_blank" rel="noopener" className="font-bold whitespace-nowrap text-coral-deep">
        Comment mettre à jour
      </a>
    </section>
  );
}
