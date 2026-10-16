import { BellOff, ShieldCheck } from "lucide-react";
import { useAppState } from "../hooks/useAppState";
import { useI18n } from "../useI18n";
import { localizeAlert } from "../localizeAlert";
import { toast } from "../toast";
import * as api from "../api";
import { AlertIcon, ConfidenceTag, EmptyState } from "../components/Badges";

export function AlertsView({ onSelect }: { onSelect: (pid: number) => void }) {
  const { snapshot, refresh } = useAppState();
  const { t, tr } = useI18n();
  const alerts = snapshot?.alerts ?? [];

  async function dismiss(key: string) {
    await api.dismissAlert(key);
    toast(t.toasts.alertDismissed);
    refresh();
  }

  return (
    <div className="main" style={{ gridTemplateRows: "auto 1fr" }}>
      <div className="view-header">
        <h1>{t.alerts.title}</h1>
        <span className="count">{alerts.length} {t.alerts.active}</span>
        <div className="view-actions">
          <button
            className="btn ghost"
            onClick={async () => {
              await api.restoreDismissedAlerts();
              toast(t.toasts.alertsRestored);
              refresh();
            }}
            title={t.alerts.restoreTip}
          >
            <BellOff size={13} /> {t.alerts.restoreDismissed}
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="panel">
          <EmptyState icon={ShieldCheck} title={t.alerts.emptyTitle}>
            {t.alerts.emptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((a) => {
            const la = localizeAlert(a, t, tr);
            return (
              <div key={a.key} className={`alert-card ${a.severity}`}>
                <span className="alert-icon">
                  <AlertIcon kind={a.kind} severity={a.severity} />
                </span>
                <div className="alert-body">
                  <div className="alert-title">{la.title}</div>
                  <div className="alert-detail">{la.detail}</div>
                  <div className="alert-meta">
                    <span className={`badge ${a.severity === "warning" ? "amber" : "blue"}`}>{a.severity}</span>
                    <ConfidenceTag level={a.confidence} />
                    {a.related_ports.map((p) => (
                      <span key={p} className="port-chip">
                        {tr(t.alerts.portLabel, { port: p })}
                      </span>
                    ))}
                    {a.related_pids.map((pid) => (
                      <button key={pid} className="btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => onSelect(pid)}>
                        {tr(t.alerts.inspectPid, { pid })}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn ghost alert-dismiss" onClick={() => dismiss(a.key)} title={t.common.dismiss}>
                  {t.common.dismiss}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: "var(--text-muted)", fontSize: 11.5, margin: "4px 2px" }}>{t.alerts.footer}</p>
    </div>
  );
}
