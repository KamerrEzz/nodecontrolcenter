import { useEffect, useMemo, useState } from "react";
import { CircleSlash, Globe2, HelpCircle, Search, X, Scissors } from "lucide-react";
import { useAppState } from "../hooks/useAppState";
import { useI18n } from "../useI18n";
import * as api from "../api";
import type { PortStatus, ProcessInfo } from "../types";
import { EmptyState } from "../components/Badges";

type ListFilter = "all" | "tcp-listen" | "udp";

export function PortsView({
  query,
  onSelect,
  onKill,
}: {
  query: string;
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
}) {
  const { snapshot, settings } = useAppState();
  const { t } = useI18n();
  const [filter, setFilter] = useState<ListFilter>("tcp-listen");
  const [lookupPort, setLookupPort] = useState("");
  const [lookupResult, setLookupResult] = useState<PortStatus | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);

  async function runLookup(portArg?: number) {
    const p = portArg ?? Number.parseInt(lookupPort, 10);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      setPortError(t.ports.invalidPort);
      return;
    }
    setPortError(null);
    setLookupBusy(true);
    try {
      setLookupResult(await api.getPortStatus(p));
    } catch (e) {
      setPortError(String(e));
    } finally {
      setLookupBusy(false);
    }
  }

  // Keep the lookup honest when a new snapshot arrives.
  useEffect(() => {
    if (lookupResult?.status === "listening") {
      setLookupResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.generated_at_secs]);

  const rows = useMemo(() => {
    let list = snapshot?.sockets ?? [];
    if (filter === "tcp-listen") list = list.filter((e) => e.protocol === "tcp" && e.state === "listen");
    else if (filter === "udp") list = list.filter((e) => e.protocol === "udp");
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.port.toString() === q ||
          e.local_addr.toLowerCase().includes(q) ||
          e.process_names.some((n) => n.toLowerCase().includes(q)) ||
          e.pids.some((pid) => pid.toString() === q),
      );
    }
    return list;
  }, [snapshot, filter, query]);

  const nameForPid = useMemo(() => {
    const map = new Map<number, ProcessInfo>();
    for (const p of snapshot?.processes ?? []) map.set(p.pid, p);
    return map;
  }, [snapshot]);

  const filterLabels: Record<ListFilter, string> = {
    "tcp-listen": t.ports.filterTcp,
    all: t.ports.filterAllTcp,
    udp: t.ports.filterUdp,
  };

  return (
    <div className="main" style={{ gridTemplateRows: "auto auto auto auto 1fr" }}>
      <div className="view-header">
        <h1>{t.ports.title}</h1>
        <span className="count">{rows.length} {t.ports.socketsShown}</span>
      </div>

      {/* Port lookup */}
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Search size={14} style={{ color: "var(--text-muted)" }} />
        <strong style={{ fontSize: 12.5 }}>{t.ports.lookupQuestion}</strong>
        <input
          type="text"
          className="setting-input"
          style={{ width: 110 }}
          placeholder={t.ports.lookupPlaceholder}
          value={lookupPort}
          inputMode="numeric"
          onChange={(e) => {
            setLookupPort(e.target.value.replace(/[^0-9]/g, ""));
            setPortError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && runLookup()}
        />
        <button className="btn primary" onClick={() => runLookup()} disabled={lookupBusy}>
          {lookupBusy ? <span className="spinner" /> : t.ports.check}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{t.ports.favorites}</span>
        {(settings?.favoritePorts ?? []).map((p) => (
          <button
            key={p}
            className="chip"
            onClick={() => {
              setLookupPort(p.toString());
              runLookup(p);
            }}
          >
            {p}
          </button>
        ))}
        {portError && <span style={{ color: "var(--red)", fontSize: 12 }}>{portError}</span>}
        {lookupResult && (
          <LookupResultView result={lookupResult} onSelect={onSelect} onKill={onKill} onClear={() => setLookupResult(null)} nameForPid={nameForPid} />
        )}
      </div>

      <details className="ports-help">
        <summary>{t.portsHelp.legendTitle}</summary>
        <ul>
          <li>{t.portsHelp.legendListening}</li>
          <li>{t.portsHelp.legendFree}</li>
          <li>{t.portsHelp.legendUnknown}</li>
        </ul>
      </details>

      <div className="chip-row">
        {(Object.keys(filterLabels) as ListFilter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {filterLabels[f]}
          </button>
        ))}
        {filter === "udp" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.ports.udpNote}</span>}
      </div>

      <div className="table-wrap" style={{ maxHeight: "100%" }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 70 }}>{t.ports.colProtocol}</th>
              <th style={{ width: 80 }}>{t.ports.colPort}</th>
              <th style={{ width: 130 }}>{t.ports.colLocal}</th>
              <th style={{ width: 110 }}>{t.ports.colState}</th>
              <th>{t.ports.colOwner}</th>
              <th style={{ width: 110 }}>{t.ports.colNode}</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr
                key={`${e.protocol}-${e.local_addr}-${e.port}-${i}`}
                onClick={() => e.pids[0] != null && onSelect(e.pids[0])}
              >
                <td className="mono">{e.protocol.toUpperCase()}</td>
                <td className="mono" style={{ fontWeight: 650 }}>
                  {e.port}
                </td>
                <td className="mono">
                  {e.local_addr}:{e.port}
                </td>
                <td>{e.protocol === "udp" ? "—" : e.state}</td>
                <td>
                  {e.pids.length ? (
                    e.pids.map((pid) => (
                      <span key={pid} className="mono" style={{ marginRight: 10 }} title={nameForPid.get(pid)?.cmd ?? ""}>
                        {pid} · {nameForPid.get(pid)?.name ?? e.process_names.find((n) => n) ?? t.common.unknown}
                      </span>
                    ))
                  ) : (
                    <span className="cell-dim" title={t.ports.ownerUnidentifiableTip}>
                      {t.ports.ownerUnidentifiable}
                    </span>
                  )}
                </td>
                <td>{e.node_related ? <span className="badge violet">{t.ports.node}</span> : <span className="badge gray">{t.ports.other}</span>}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  {e.pids.length === 1 && nameForPid.has(e.pids[0]) ? (
                    <button className="btn ghost icon-only" title={t.ports.terminateOwner} onClick={() => onKill(nameForPid.get(e.pids[0])!)}>
                      <Scissors size={13} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState icon={Globe2} title={t.ports.noSockets}>
            {t.ports.noSocketsBody}
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function LookupResultView({
  result,
  onSelect,
  onKill,
  onClear,
  nameForPid,
}: {
  result: PortStatus;
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
  onClear: () => void;
  nameForPid: Map<number, ProcessInfo>;
}) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
      {result.status === "listening" && (
        <>
          <span className="badge green">
            <span className="dot" /> {t.ports.resultListening}
          </span>
          <span className="mono" style={{ fontSize: 11.5 }}>
            {result.entry.protocol.toUpperCase()} {result.entry.local_addr}:{result.entry.port} · PID{" "}
            {result.entry.pids.join(", ") || t.common.notAvailable} ·{" "}
            {result.entry.process_names.join(", ") || t.common.unknown}
          </span>
        </>
      )}
      {result.status === "free" && (
        <span className="badge gray">
          <CircleSlash size={12} /> {t.ports.resultFree}
        </span>
      )}
      {result.status === "unknown" && (
        <span className="badge amber" title={result.reason}>
          <HelpCircle size={12} /> {t.ports.resultUnknown} — {result.reason}
        </span>
      )}
      {result.status === "listening" && result.entry.pids.length === 1 && nameForPid.has(result.entry.pids[0]) && (
        <>
          <button className="btn ghost" onClick={() => onSelect(result.entry.pids[0])}>
            {t.common.inspect}
          </button>
          <button className="btn danger" onClick={() => onKill(nameForPid.get(result.entry.pids[0])!)}>
            {t.ports.terminateOwner}
          </button>
        </>
      )}
      <button className="btn ghost icon-only" onClick={onClear} title={t.common.close}>
        <X size={13} />
      </button>
    </div>
  );
}
