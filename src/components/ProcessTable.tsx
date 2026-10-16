// Sortable, filterable process table shared by Overview and Processes views.

import { useMemo, useState } from "react";
import { Scissors } from "lucide-react";
import { useI18n } from "../useI18n";
import type { ProcessInfo } from "../types";
import { formatMemory, formatUptime, truncateCmd } from "../format";
import { StatusBadge } from "./Badges";

export type ProcessSortKey = "pid" | "name" | "cpu" | "mem" | "uptime" | "ports";

const COLUMNS_OLD: never[] = [];
void COLUMNS_OLD;

export function ProcessTable({
  processes,
  selectedPid,
  onSelect,
  onKill,
  emptyState,
}: {
  processes: ProcessInfo[];
  selectedPid: number | null;
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
  emptyState?: React.ReactNode;
}) {
  const { t } = useI18n();
  const columns: { key: ProcessSortKey | null; label: string; width?: string }[] = [
    { key: null, label: t.processes.colStatus, width: "110px" },
    { key: "name", label: t.processes.colProcess },
    { key: "pid", label: t.processes.colPid, width: "76px" },
    { key: "ports", label: t.processes.colPorts, width: "120px" },
    { key: null, label: t.processes.colProject, width: "200px" },
    { key: "uptime", label: t.processes.colUptime, width: "92px" },
    { key: "cpu", label: t.processes.colCpu, width: "70px" },
    { key: "mem", label: t.processes.colMemory, width: "90px" },
    { key: null, label: "", width: "60px" },
  ];
  const [sortKey, setSortKey] = useState<ProcessSortKey>("cpu");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...processes];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "pid":
          cmp = a.pid - b.pid;
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "cpu":
          cmp = (a.cpu_percent ?? -1) - (b.cpu_percent ?? -1);
          break;
        case "mem":
          cmp = (a.mem_mb ?? -1) - (b.mem_mb ?? -1);
          break;
        case "uptime":
          cmp = (a.run_time_secs ?? -1) - (b.run_time_secs ?? -1);
          break;
        case "ports":
          cmp = Math.max(-1, ...a.ports) - Math.max(-1, ...b.ports);
          break;
      }
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [processes, sortKey, sortDesc]);

  function toggleSort(key: ProcessSortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (!processes.length) {
    return <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>{emptyState}</div>;
  }

  return (
    <div className="table-wrap" style={{ maxHeight: "100%" }}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} style={{ width: col.width }} onClick={col.key ? () => toggleSort(col.key!) : undefined}>
                {col.label}
                {col.key && sortKey === col.key && <span className="sort-arrow">{sortDesc ? "▼" : "▲"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.pid} className={selectedPid === p.pid ? "selected" : ""} onClick={() => onSelect(p.pid)}>
              <td>
                <StatusBadge listening={p.is_listening} status={p.status} />
              </td>
              <td title={p.cmd}>
                <div style={{ fontWeight: 550 }}>{p.name}</div>
                <div className="cell-dim mono" style={{ fontSize: 10.5 }}>
                  {truncateCmd(p.cmd || p.exe || "", 80)}
                </div>
              </td>
              <td className="mono">{p.pid}</td>
              <td>
                {p.ports.length ? (
                  p.ports.map((port) => (
                    <span key={port} className="port-chip node">
                      {port}
                    </span>
                  ))
                ) : (
                  <span className="cell-dim">—</span>
                )}
              </td>
              <td title={p.project_dir ?? undefined}>{p.project_dir ?? <span className="cell-dim">{t.common.notAvailableLong}</span>}</td>
              <td>{formatUptime(p.run_time_secs, t.common.notAvailable)}</td>
              <td>{p.cpu_percent != null ? `${p.cpu_percent.toFixed(1)}%` : t.common.notAvailable}</td>
              <td>{formatMemory(p.mem_mb, t.common.notAvailable)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost icon-only" title={t.processes.terminateTitle} onClick={() => onKill(p)}>
                  <Scissors size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <tfoot>
        <tr style={{ display: "none" }} />
      </tfoot>
    </div>
  );
}

