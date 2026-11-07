// Bandeau en haut des options quand une version plus récente de Barrage est
// publiée, avec le lien vers le guide de mise à jour du site.
import { Download } from "lucide-react";
import { UPDATE_GUIDE_URL } from "@/core/config.ts";
import { Callout } from "@/ui/layout/Section.tsx";
import { updateAvailable } from "./version.ts";

export function UpdateBanner({ latestVersion }: { latestVersion: string | null }) {
  if (!updateAvailable(latestVersion)) return null;
  const installed = chrome.runtime.getManifest().version;
  return (
    <Callout
      role="status"
      icon={Download}
      title="Nouvelle version de Barrage disponible"
      action={
        <a href={UPDATE_GUIDE_URL} target="_blank" rel="noopener" className="font-bold whitespace-nowrap text-coral-deep">
          Comment mettre à jour
        </a>
      }
    >
      Version {latestVersion} publiée, vous avez la {installed}.
    </Callout>
  );
}
