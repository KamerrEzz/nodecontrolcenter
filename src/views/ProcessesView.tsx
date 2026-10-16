import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { useAppState } from "../hooks/useAppState";
import { useI18n } from "../useI18n";
import type { ProcessInfo } from "../types";
import { ProcessTable } from "../components/ProcessTable";
import { EmptyState } from "../components/Badges";

type StatusFilter = "all" | "listening" | "idle";
type KindFilter = "all" | "node" | "launcher" | "related";

export function ProcessesView({
  query,
  selectedPid,
  onSelect,
  onKill,
}: {
  query: string;
  selectedPid: number | null;
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
}) {
  const { snapshot } = useAppState();
  const { t, tr } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [onlyHighConfidence, setOnlyHighConfidence] = useState(false);

  const filtered = useMemo(() => {
    let list = snapshot?.processes ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.cmd.toLowerCase().includes(q) ||
          p.pid.toString() === q ||
          (p.project_dir ?? "").toLowerCase().includes(q) ||
          p.ports.some((port) => port.toString() === q),
      );
    }
    if (statusFilter === "listening") list = list.filter((p) => p.is_listening);
    if (statusFilter === "idle") list = list.filter((p) => !p.is_listening);
    if (kindFilter !== "all") list = list.filter((p) => p.kind === kindFilter);
    if (onlyHighConfidence) list = list.filter((p) => p.confidence === "high");
    return list;
  }, [snapshot, query, statusFilter, kindFilter, onlyHighConfidence]);

  const total = snapshot?.processes.length ?? 0;

  const statusLabels: Record<StatusFilter, string> = {
    all: t.processes.allStatuses,
    listening: t.processes.listening,
    idle: t.processes.noPorts,
  };
  const kindLabels: Record<KindFilter, string> = {
    all: t.processes.allKinds,
    node: t.processes.kindNode,
    launcher: t.processes.kindLauncher,
    related: t.processes.kindRelated,
  };

  return (
    <div className="main" style={{ gridTemplateRows: "auto auto auto 1fr" }}>
      <div className="view-header">
        <h1>{t.processes.title}</h1>
        <span className="count">{tr(t.processes.count, { shown: filtered.length, total })}</span>
      </div>

      <div className="chip-row">
        {(Object.keys(statusLabels) as StatusFilter[]).map((f) => (
          <button key={f} className={`chip ${statusFilter === f ? "active" : ""}`} onClick={() => setStatusFilter(f)}>
            {statusLabels[f]}
          </button>
        ))}
        <span style={{ width: 8 }} />
        {(Object.keys(kindLabels) as KindFilter[]).map((f) => (
          <button key={f} className={`chip ${kindFilter === f ? "active" : ""}`} onClick={() => setKindFilter(f)}>
            {kindLabels[f]}
          </button>
        ))}
        <span style={{ width: 8 }} />
        <button className={`chip ${onlyHighConfidence ? "active" : ""}`} onClick={() => setOnlyHighConfidence((v) => !v)}>
          {t.processes.highConfidenceOnly}
        </button>
      </div>

      <ProcessTable
        processes={filtered}
        selectedPid={selectedPid}
        onSelect={onSelect}
        onKill={onKill}
        emptyState={
          total === 0 ? (
            <EmptyState icon={SearchX} title={t.processes.emptyNoProcesses}>
              {t.processes.emptyNoProcessesBody}
            </EmptyState>
          ) : (
            <EmptyState icon={Search} title={t.processes.emptyNoMatches}>
              {t.processes.emptyNoMatchesBody}
            </EmptyState>
          )
        }
      />
    </div>
  );
}
