// Analyse d'une liste à importer, sans rien enregistrer : adresse GitHub
// téléchargée par le service worker, ou fichier lu dans la page d'options.
import { useRef, useState } from "react";
import { IMPORT_LIST, type ImportListReply, type Message } from "@/core/messages.ts";
import type { StatusReport } from "@/ui/layout/Section.tsx";
import {
  DOWNLOAD_ERROR,
  FILE_ERROR,
  analyzeList,
  checkListFile,
  describeReport,
  validateListUrl,
  type ImportReport,
} from "./import.ts";
import type { NewList } from "./store.ts";

export type Analysis = Omit<NewList, "networks"> & { warning?: string };

const refused = (message: string): StatusReport => ({ message, kind: "error" });

const readReport = (report: ImportReport): StatusReport =>
  report.ok ? { message: describeReport(report), kind: report.warning ? "warn" : "ok" } : refused(report.reason);

const warningOf = (report: Extract<ImportReport, { ok: true }>) => (report.warning ? { warning: report.warning } : {});

export function useListAnalysis() {
  const [outcome, setOutcome] = useState<StatusReport | null>(null);
  const [busy, setBusy] = useState(false);
  /** Dernière analyse demandée : la réponse d'une analyse dépassée est ignorée. */
  const latest = useRef(0);

  /** Analyse en cours, ou null si elle est refusée ou dépassée. */
  async function run(task: () => Promise<{ outcome: StatusReport; analysis: Analysis | null }>, onError: string) {
    const id = ++latest.current;
    setBusy(true);
    let result: Awaited<ReturnType<typeof task>>;
    try {
      result = await task();
    } catch {
      result = { outcome: refused(onError), analysis: null };
    }
    if (id !== latest.current) return null;
    setBusy(false);
    setOutcome(result.outcome);
    return result.analysis;
  }

  /** Renvoie la liste analysée, ou null si elle est refusée. */
  function analyzeUrl(raw: string): Promise<Analysis | null> {
    return run(async () => {
      const checked = validateListUrl(raw);
      if (!checked.ok) return { outcome: refused(checked.reason), analysis: null };
      const reply = (await chrome.runtime.sendMessage({ type: IMPORT_LIST, url: checked.url } satisfies Message)) as ImportListReply;
      return {
        outcome: readReport(reply),
        analysis: reply.ok ? { source: "github", url: reply.url, handles: reply.handles, ...warningOf(reply) } : null,
      };
    }, DOWNLOAD_ERROR);
  }

  function analyzeFile(file: File): Promise<Analysis | null> {
    return run(async () => {
      const problem = checkListFile(file.name, file.size);
      if (problem) return { outcome: refused(problem), analysis: null };
      const report = analyzeList(await file.text());
      return {
        outcome: readReport(report),
        analysis: report.ok ? { source: "file", handles: report.handles, ...warningOf(report) } : null,
      };
    }, FILE_ERROR);
  }

  function reset(): void {
    latest.current++;
    setBusy(false);
    setOutcome(null);
  }

  return { outcome, busy, analyzeUrl, analyzeFile, reset };
}
