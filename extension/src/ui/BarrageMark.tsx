// Logo Barrage : disque corail barré de blanc. Options et notification de x.com :
// ni cn ni lucide, pour rester léger dans le content script.
export function BarrageMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" className="fill-coral" />
      <rect x="12" y="20.25" width="24" height="7.5" rx="1.5" className="fill-white" />
    </svg>
  );
}
