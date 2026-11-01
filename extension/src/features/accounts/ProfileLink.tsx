// Lien vers un profil, ouvert dans un nouvel onglet.
import { NETWORKS, type NetworkId } from "../networks/networks.ts";

export function ProfileLink({ network, handle, className }: { network: NetworkId; handle: string; className?: string }) {
  const entry = NETWORKS.find((n) => n.id === network);
  return (
    <a href={entry?.profileUrl(handle) ?? "#"} target="_blank" rel="noopener" className={className}>
      {entry?.display?.(handle) ?? `@${handle}`}
    </a>
  );
}
