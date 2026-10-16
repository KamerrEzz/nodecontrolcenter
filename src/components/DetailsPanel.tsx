// Contextual details panel for the selected process.

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Folder, RefreshCw, Scissors, X } from "lucide-react";
import { useI18n } from "../useI18n";
import * as api from "../api";
import type { ProcessDetails } from "../types";
import { formatDateTime, formatMemory, formatUptime } from "../format";
import { ConfidenceTag, KindBadge, StatusBadge } from "./Badges";

export function DetailsPanel({
  pid,
  onClose,
  onKill,
  onRefresh,
}: {
  pid: number;
  onClose: () => void;
  onKill: () => void;
  onRefresh: () => void;
}) {
  const { t, dateLocale } = useI18n();
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setDetails(await api.getProcessDetails(pid));
    } catch (e) {
      setDetails(null);
      setError(String(e));
    }
  }

  useEffect(() => {
    setDetails(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(`could not copy ${what}`);
    }
  }

  return (
    <aside className="details-panel">
      <div className="details-header">
        <h2>{t.details.process.replace("{pid}", pid.toString())}</h2>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn ghost icon-only" title={t.details.reload} onClick={load}>
            <RefreshCw size={14} />
          </button>
          <button className="btn ghost icon-only" title={t.common.close} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!details && !error && (
        <div className="empty-state">
          <span className="spinner" />
          <p>{t.common.loading}</p>
        </div>
      )}

      {details && (
        <>
          <div className="kv-section">
            <h3>{t.details.identity}</h3>
            <dl className="kv">
              <dt>{t.details.pidPpid}</dt>
              <dd className="mono">
                {details.process.pid} / {details.process.ppid ?? "—"}
              </dd>
              <dt>{t.details.name}</dt>
              <dd>{details.process.name}</dd>
              <dt>{t.details.executable}</dt>
              <dd>{details.process.exe ?? t.common.notAvailableLong}</dd>
              <dt>{t.details.status}</dt>
              <dd>
                <StatusBadge listening={details.process.is_listening} status={details.process.status} />
              </dd>
              <dt>{t.details.classification}</dt>
              <dd>
                <KindBadge kind={details.process.kind} role={details.process.role} />{" "}
                <ConfidenceTag level={details.process.confidence} />
              </dd>
            </dl>
          </div>

          <div className="kv-section">
            <h3>{t.details.commandLine}</h3>
            <div className="cmd-block">{details.process.cmd || "(empty)"}</div>
            <div className="action-row">
              <button className="btn ghost" onClick={() => copy(details.process.cmd, "command")}>
                <Copy size={13} /> {copied === "command" ? t.details.copied : t.details.copyCommand}
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  copy(
                    JSON.stringify(
                      {
                        pid: details.process.pid,
                        ppid: details.process.ppid,
                        name: details.process.name,
                        exe: details.process.exe,
                        cmd: details.process.cmd,
                        ports: details.process.ports,
                        projectDir: details.process.project_dir,
                        status: details.process.status,
                      },
                      null,
                      2,
                    ),
                    "info",
                  )
                }
              >
                <Copy size={13} /> {copied === "info" ? t.details.copied : t.details.copyInfo}
              </button>
            </div>
          </div>

          <div className="kv-section">
            <h3>{t.details.projectDir}</h3>
            {details.process.project_dir ? (
              <>
                <dl className="kv">
                  <dt>{t.details.directory}</dt>
                  <dd className="mono">{details.process.project_dir}</dd>
                  <dt>{t.details.source}</dt>
                  <dd>{details.process.project_dir_source ?? "—"}</dd>
                </dl>
                <div className="action-row">
                  <button className="btn" onClick={() => api.openInExplorer(details.process.project_dir!)}>
                    <Folder size={13} /> {t.details.openExplorer}
                  </button>
                </div>
              </>
            ) : (
              <p className="cell-dim" style={{ margin: 0, fontSize: 12 }}>
                {t.details.projectNotAvailable}
              </p>
            )}
          </div>

          <div className="kv-section">
            <h3>{t.details.portsHeading}</h3>
            {details.process.ports.length ? (
              <dl className="kv">
                <dt>{t.details.listeningOn}</dt>
                <dd>
                  {details.process.ports.map((p) => (
                    <span key={p} className="port-chip node">
                      {p}
                    </span>
                  ))}
                </dd>
                {details.port_entries.length > 0 && (
                  <>
                    <dt>{t.details.addresses}</dt>
                    <dd>
                      {details.port_entries.map((e, i) => (
                        <div key={i} className="mono">
                          {e.protocol.toUpperCase()} {e.local_addr}:{e.port} ({e.state})
                        </div>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="cell-dim" style={{ margin: 0, fontSize: 12 }}>
                {t.details.noPorts}
              </p>
            )}
          </div>

          <div className="kv-section">
            <h3>{t.details.tree}</h3>
            <dl className="kv">
              <dt>{t.details.parent}</dt>
              <dd>{details.parent ? `PID ${details.parent.pid} · ${details.parent.name}` : details.process.ppid ? `PID ${details.process.ppid} ${t.details.parentNotRunning}` : t.common.none}</dd>
              <dt>{t.details.children}</dt>
              <dd>
                {details.children.length
                  ? details.children.map((c) => (
                      <div key={c.pid} className="mono">
                        PID {c.pid} · {c.name}
                      </div>
                    ))
                  : t.details.noneDetected}
              </dd>
            </dl>
          </div>

          <div className="kv-section">
            <h3>{t.details.metrics}</h3>
            <dl className="kv">
              <dt>{t.details.started}</dt>
              <dd>{formatDateTime(details.process.start_time_secs, dateLocale, t.common.notAvailableLong)}</dd>
              <dt>{t.details.uptime}</dt>
              <dd>{formatUptime(details.process.run_time_secs, t.common.notAvailable)}</dd>
              <dt>CPU</dt>
              <dd>{details.process.cpu_percent != null ? `${details.process.cpu_percent.toFixed(1)}%` : t.common.notAvailable}</dd>
              <dt>{t.details.memory}</dt>
              <dd>{formatMemory(details.process.mem_mb, t.common.notAvailable)}</dd>
            </dl>
          </div>

          <div className="action-row">
            <button className="btn danger" onClick={onKill}>
              <Scissors size={13} /> {t.details.terminate}
            </button>
            <button className="btn ghost" onClick={onRefresh}>
              <RefreshCw size={13} /> {t.details.refresh}
            </button>
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: 10.5, marginTop: 14, lineHeight: 1.5 }}>
            <ExternalLink size={10} style={{ verticalAlign: "-1px" }} /> {t.details.safetyNote}
          </p>
        </>
      )}
    </aside>
  );
}
