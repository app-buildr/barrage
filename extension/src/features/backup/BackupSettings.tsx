// Carte « Sauvegarde » de Réglages : exporter l'état dans un fichier, et le
// restaurer après un aperçu.
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { formatLongDate } from "@/core/intl.ts";
import { readStorage } from "@/core/state.ts";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { Button } from "@/ui/components/button.tsx";
import { Hint, Panel, StatusMessage, type StatusReport } from "@/ui/layout/Section.tsx";
import { BACKUP_INVALID, BACKUP_MAX_BYTES, backupFileName, checkBackup, createBackup, describeBackup } from "./backup.ts";

async function download(): Promise<void> {
  const now = Date.now();
  const backup = createBackup(await readStorage(), chrome.runtime.getManifest().version, now);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(now);
  link.click();
  URL.revokeObjectURL(url);
}

type Ready = { backup: unknown; summary: string };

export function BackupSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [status, setStatus] = useState<StatusReport | null>(null);
  const { error, attempt } = useSafeWrite();

  async function read(file: File): Promise<void> {
    setReady(null);
    setStatus(null);
    if (file.size > BACKUP_MAX_BYTES) return setStatus({ kind: "error", message: BACKUP_INVALID });
    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      return setStatus({ kind: "error", message: BACKUP_INVALID });
    }
    const check = checkBackup(backup);
    if (!check.ok) return setStatus({ kind: "error", message: check.reason });
    const date = check.exportedAt ? `Sauvegarde du ${formatLongDate(check.exportedAt)} : ` : "Sauvegarde : ";
    setReady({ backup, summary: date + describeBackup(check) });
  }

  async function restore(backup: unknown): Promise<void> {
    await attempt(
      write("restoreBackup", backup).then((reply) => {
        setReady(null);
        setStatus(reply.ok ? { kind: "ok", message: "Sauvegarde restaurée." } : { kind: "error", message: reply.reason });
      }),
    );
  }

  return (
    <section>
      <Panel>
        <h2 className="mb-4">Sauvegarde</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void attempt(download())}>
            <Download />
            Exporter mes données
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()}>
            <Upload />
            Restaurer une sauvegarde
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ""; // Le même fichier peut être rechoisi.
              if (file) void read(file);
            }}
          />
        </div>
        <Hint>
          Vos listes, réglages et résultats restent dans ce navigateur, liés au dossier de l'extension : installée
          ailleurs, Barrage repart de zéro. Le fichier les garde, X ne pouvant pas dire qui a bloqué quoi. Restaurer
          n'efface rien et ne lance aucun blocage.
        </Hint>
        {ready ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-body text-ink">
            <span>{ready.summary}</span>
            <Button variant="cta" onClick={() => void restore(ready.backup)}>
              Restaurer
            </Button>
            <Button variant="outline" onClick={() => setReady(null)}>
              Annuler
            </Button>
          </div>
        ) : null}
        <StatusMessage kind={status?.kind} message={status?.message} className="mt-3" />
        <StatusMessage kind="error" message={error} className="mt-3" />
      </Panel>
    </section>
  );
}
