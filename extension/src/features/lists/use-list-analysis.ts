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

const ANALYZING: StatusReport = { message: "Analyse en cours…", kind: "muted" };

export function useListAnalysis() {
  const [outcome, setOutcome] = useState<StatusReport | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  /** Dernière analyse demandée : une analyse dépassée ne touche à rien, résultat en place compris. */
  const latest = useRef(0);

  async function run(task: () => Promise<{ outcome: StatusReport; analysis: Analysis | null }>, onError: string) {
    const id = ++latest.current;
    setBusy(true);
    let result: Awaited<ReturnType<typeof task>>;
    try {
      result = await task();
    } catch {
      result = { outcome: refused(onError), analysis: null };
    }
    if (id !== latest.current) return;
    setBusy(false);
    setOutcome(result.outcome);
    setAnalysis(result.analysis);
  }

  function analyzeUrl(raw: string): Promise<void> {
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

  function analyzeFile(file: File): Promise<void> {
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
    setAnalysis(null);
  }

  /** `outcome` : le compte rendu à afficher. `analysis` : la liste analysée, null si elle est refusée. */
  return { outcome: busy ? ANALYZING : outcome, analysis, busy, analyzeUrl, analyzeFile, reset };
}
