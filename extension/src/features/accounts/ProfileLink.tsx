// Lien vers un profil, ouvert dans un nouvel onglet.
import type { Network } from "../networks/networks.ts";

export function ProfileLink({ network, handle, className }: { network: Network; handle: string; className?: string }) {
  return (
    <a href={network.profileUrl(handle)} target="_blank" rel="noopener" className={className}>
      {network.display?.(handle) ?? `@${handle}`}
    </a>
  );
}
