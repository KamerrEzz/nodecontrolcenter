import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Copy, Globe, Server, Radar, Globe2, BellRing, X } from "lucide-react";
import { useAppState } from "../hooks/useAppState";
import { useI18n } from "../useI18n";
import { localizeAlert } from "../localizeAlert";
import type { Alert, ProcessInfo } from "../types";
import { ProcessTable } from "../components/ProcessTable";
import { AlertIcon, EmptyState } from "../components/Badges";
import { formatUptime } from "../format";

const WELCOME_KEY = "ncc-welcome-dismissed";

export function OverviewView({
  onSelect,
  onKill,
  goTo,
}: {
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
  goTo: (view: string) => void;
}) {
  const { snapshot } = useAppState();
  const { t, tr } = useI18n();
  const [showWelcome, setShowWelcome] = useState(() => !window.localStorage.getItem(WELCOME_KEY));

  const listening = useMemo(() => (snapshot?.processes ?? []).filter((p) => p.is_listening), [snapshot]);
  const noPorts = useMemo(() => (snapshot?.processes ?? []).filter((p) => !p.is_listening), [snapshot]);

  if (!snapshot) return null;

  const s = snapshot.stats;
  const portErrors = snapshot.errors;
  const localized = (a: Alert) => localizeAlert(a, t, tr);

  return (
    <div className="main" style={{ gridTemplateRows: "auto auto 1fr" }}>
      <div className="view-header">
        <h1>{t.overview.title}</h1>
        <span className="count">
          {t.overview.snapshotAt} {new Date(snapshot.generated_at_secs * 1000).toLocaleTimeString()}
        </span>
      </div>

      {showWelcome && (
        <div className="welcome-card">
          <div className="welcome-head">
            <h2>{t.welcome.title}</h2>
            <button
              className="btn ghost icon-only"
              title={t.common.close}
              onClick={() => {
                window.localStorage.setItem(WELCOME_KEY, "1");
                setShowWelcome(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
          <p>{t.welcome.body}</p>
          <div className="welcome-tips">
            <div className="welcome-tip">
              <Globe2 size={15} />
              <div>
                <strong>{t.welcome.tip1Title}</strong>
                <span>{t.welcome.tip1Body}</span>
              </div>
            </div>
            <div className="welcome-tip">
              <Radar size={15} />
              <div>
                <strong>{t.welcome.tip2Title}</strong>
                <span>{t.welcome.tip2Body}</span>
              </div>
            </div>
            <div className="welcome-tip">
              <BellRing size={15} />
              <div>
                <strong>{t.welcome.tip3Title}</strong>
                <span>{t.welcome.tip3Body}</span>
              </div>
            </div>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              window.localStorage.setItem(WELCOME_KEY, "1");
              setShowWelcome(false);
            }}
          >
            {t.welcome.gotIt}
          </button>
        </div>
      )}

      {portErrors.length > 0 && <div className="error-banner">{portErrors.join(" · ")}</div>}

      <div className="stat-grid">
        <button className="stat-card accent as-button" onClick={() => goTo("processes")} title={t.nav.processes}>
          <span className="stat-label">{t.overview.statProcesses}</span>
          <span className="stat-value">{s.node_processes}</span>
          <span className="stat-hint">{listening.length} {t.overview.statProcessesHint}</span>
        </button>
        <button className="stat-card as-button" onClick={() => goTo("ports")} title={t.nav.ports}>
          <span className="stat-label">{t.overview.statListeners}</span>
          <span className="stat-value">{s.listening_tcp}</span>
          <span className="stat-hint">{t.overview.statListenersHint}</span>
        </button>
        <button className={`stat-card as-button ${s.duplicated_projects ? "warn" : ""}`} onClick={() => goTo("alerts")} title={t.nav.alerts}>
          <span className="stat-label">{t.overview.statDuplicated}</span>
          <span className="stat-value">{s.duplicated_projects}</span>
          <span className="stat-hint">{t.overview.statDuplicatedHint}</span>
        </button>
        <button className={`stat-card as-button ${s.attention_count ? "danger" : ""}`} onClick={() => goTo("alerts")} title={t.nav.alerts}>
          <span className="stat-label">{t.overview.statAttention}</span>
          <span className="stat-value">{s.attention_count}</span>
          <span className="stat-hint">{t.overview.statAttentionHint}</span>
        </button>
      </div>

      <div className="overview-grid">
        <ProcessTable
          processes={listening}
          selectedPid={null}
          onSelect={onSelect}
          onKill={onKill}
          emptyState={
            <EmptyState icon={Server} title={t.overview.emptyTitle}>
              {t.overview.emptyBody}
            </EmptyState>
          }
        />

        <div className="panel">
          <h2>{t.overview.latestAlerts}</h2>
          {snapshot.alerts.length === 0 ? (
            <div className="alert-preview">
              <div className="alert-preview-item" style={{ cursor: "default" }}>
                <AlertTriangle size={14} style={{ color: "var(--green)" }} />
                <span>{t.overview.noAlerts}</span>
              </div>
            </div>
          ) : (
            <div className="alert-preview">
              {snapshot.alerts.slice(0, 6).map((a: Alert) => {
                const la = localized(a);
                return (
                  <div key={a.key} className="alert-preview-item" onClick={() => goTo("alerts")}>
                    <AlertIcon kind={a.kind} severity={a.severity} />
                    <span>
                      <strong>{la.title}</strong>
                      <br />
                      <span className="cell-dim">{la.detail.slice(0, 120)}{la.detail.length > 120 ? "…" : ""}</span>
                    </span>
                  </div>
                );
              })}
              {snapshot.alerts.length > 6 && (
                <div className="alert-preview-item" onClick={() => goTo("alerts")}>
                  <Copy size={14} />
                  <span>{tr(t.overview.moreAlerts, { n: snapshot.alerts.length - 6 })}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {noPorts.length > 0 && (
        <div className="panel">
          <h2>{tr(t.overview.noPortsPanel, { n: noPorts.length })}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {noPorts.slice(0, 20).map((p) => (
              <span key={p.pid} className="tag" style={{ cursor: "pointer" }} onClick={() => onSelect(p.pid)} title={p.cmd}>
                PID {p.pid} · {p.name} · {formatUptime(p.run_time_secs, t.common.notAvailable)}
              </span>
            ))}
            {noPorts.length > 20 && <span className="cell-dim">{tr(t.overview.moreNoPorts, { n: noPorts.length - 20 })}</span>}
          </div>
        </div>
      )}

      {snapshot.processes.length === 0 && (
        <div className="panel">
          <EmptyState icon={Activity} title={t.overview.emptyAllTitle}>
            {t.overview.emptyAllBody}
          </EmptyState>
        </div>
      )}

      <div className="panel" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)", fontSize: 11.5 }}>
        <Globe size={13} />
        {t.overview.privacyNote}
      </div>
    </div>
  );
}
