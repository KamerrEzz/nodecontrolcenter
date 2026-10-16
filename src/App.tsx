import { useEffect, useMemo, useState } from "react";
import { Activity, Radar, Globe2, BellRing, Settings2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { StateProvider, useAppState } from "./hooks/useAppState";
import { useI18n } from "./useI18n";
import { onToast, type ToastKind } from "./toast";
import { OverviewView } from "./views/OverviewView";
import { ProcessesView } from "./views/ProcessesView";
import { PortsView } from "./views/PortsView";
import { AlertsView } from "./views/AlertsView";
import { SettingsView } from "./views/SettingsView";
import { DetailsPanel } from "./components/DetailsPanel";
import { KillDialog, type KillRequest } from "./components/KillDialog";
import type { ProcessInfo } from "./types";

type View = "overview" | "processes" | "ports" | "alerts" | "settings";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(
    () =>
      onToast((message, kind = "ok") => {
        const id = Date.now() + Math.random();
        setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
        window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
      }),
    [],
  );
  if (!items.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { snapshot, settings, loading, refreshing, error, lastUpdated, refresh } = useAppState();
  const { t, dateLocale } = useI18n();
  const [view, setView] = useState<View>(() => {
    // Deep-link support (?view=ports) — also used for UI previews.
    const v = new URLSearchParams(window.location.search).get("view");
    return (["overview", "processes", "ports", "alerts", "settings"] as const).includes(v as View) ? (v as View) : "overview";
  });
  const [query, setQuery] = useState("");
  const [selectedPid, setSelectedPid] = useState<number | null>(() => {
    const s = new URLSearchParams(window.location.search).get("select");
    return s ? Number(s) || null : null;
  });
  const [killRequest, setKillRequest] = useState<KillRequest | null>(null);

  // Apply theme.
  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  const nav: { id: View; label: string; icon: typeof Activity }[] = useMemo(
    () => [
      { id: "overview", label: t.nav.overview, icon: Activity },
      { id: "processes", label: t.nav.processes, icon: Radar },
      { id: "ports", label: t.nav.ports, icon: Globe2 },
      { id: "alerts", label: t.nav.alerts, icon: BellRing },
      { id: "settings", label: t.nav.settings, icon: Settings2 },
    ],
    [t],
  );

  const warningCount = snapshot?.stats.attention_count ?? 0;
  const alertCount = snapshot?.alerts.length ?? 0;

  const selectedProcess = useMemo(
    () => snapshot?.processes.find((p) => p.pid === selectedPid) ?? null,
    [snapshot, selectedPid],
  );

  function requestKill(p: ProcessInfo) {
    if (!snapshot) return;
    setKillRequest({ process: p, childPids: p.children });
  }

  const showDetails = selectedPid != null && view !== "settings";

  // Keyboard: Esc closes dialogs/details; Ctrl+F focuses the search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (killRequest) setKillRequest(null);
        else if (selectedPid != null) setSelectedPid(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        const input = document.getElementById("topbar-search") as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [killRequest, selectedPid]);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Radar size={15} />
          </div>
          <div>
            <div className="brand-name">{t.nav.brand}</div>
            <div className="brand-sub">{t.nav.brandSub}</div>
          </div>
        </div>

        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
              <Icon size={15} />
              <span>{item.label}</span>
              {item.id === "alerts" && warningCount > 0 && <span className="nav-badge">{warningCount}</span>}
            </button>
          );
        })}

        <div className="nav-spacer" />
        <div className="sidebar-footnote" style={{ whiteSpace: "pre-line" }}>{t.nav.footnote}</div>
      </nav>

      {/* Topbar */}
      <header className="topbar">
        <span className="page-title">{nav.find((n) => n.id === view)?.label}</span>
        {view !== "settings" && (
          <div className="topbar-search">
            <SearchIcon />
            <input
              id="topbar-search"
              placeholder={view === "ports" ? t.topbar.searchPlaceholderPorts : t.topbar.searchPlaceholderProcesses}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <span className="search-match">
                {view === "ports"
                  ? `${(snapshot?.sockets ?? []).filter((e) => e.port.toString() === query.trim()).length}`
                  : `${(snapshot?.processes ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).length}`}
              </span>
            )}
          </div>
        )}
        <div className="view-actions">
          {lastUpdated && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {t.topbar.updated} {new Date(lastUpdated).toLocaleTimeString(dateLocale)}
            </span>
          )}
          <button className="btn icon-only" title={t.topbar.refreshNow} onClick={refresh} disabled={refreshing}>
            {refreshing ? <span className="spinner" /> : <RefreshCw size={13} />}
          </button>
        </div>
      </header>

      {/* Main area */}
      {loading ? (
        <div className="main" style={{ display: "grid", placeItems: "center" }}>
          <div className="empty-state">
            <span className="spinner" />
            <h3>{t.common.loading}</h3>
            <p>{t.overview.privacyNote}</p>
          </div>
        </div>
      ) : (
        <div className="with-details">
          <div className="content-area" style={{ padding: 0 }}>
            {view === "overview" && <OverviewView onSelect={selectAndInspect} onKill={requestKill} goTo={(v) => setView(v as View)} />}
            {view === "processes" && <ProcessesView query={query} selectedPid={selectedPid} onSelect={selectAndInspect} onKill={requestKill} />}
            {view === "ports" && <PortsView query={query} onSelect={selectAndInspect} onKill={requestKill} />}
            {view === "alerts" && <AlertsView onSelect={selectAndInspect} />}
            {view === "settings" && <SettingsView />}
          </div>
          {showDetails && selectedProcess && (
            <DetailsPanel pid={selectedPid!} onClose={() => setSelectedPid(null)} onKill={() => requestKill(selectedProcess)} onRefresh={refresh} />
          )}
        </div>
      )}

      {/* Status bar */}
      <footer className="statusbar">
        <span className={`status-dot ${refreshing ? "refreshing" : error ? "error" : ""}`} />
        <span>{error ? t.status.errors : refreshing ? t.status.refreshing : t.status.live}</span>
        <span className="grow" />
        <span>
          {snapshot
            ? `${snapshot.stats.node_processes} ${t.status.summary} · ${snapshot.stats.listening_tcp} ${t.status.listeners} · ${alertCount} ${t.status.alerts}`
            : "—"}
        </span>
        <span>·</span>
        <span>Node Control Center v0.1.0</span>
      </footer>

      {killRequest && (
        <KillDialog
          request={killRequest}
          onClose={() => setKillRequest(null)}
          onDone={() => {
            setKillRequest(null);
            refresh();
          }}
        />
      )}
      <ToastHost />
    </div>
  );

  function selectAndInspect(pid: number) {
    setSelectedPid(pid);
  }
}

function SearchIcon() {
  // Inline to avoid another import at top; lucide Search used in views.
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function App() {
  return (
    <StateProvider>
      <Shell />
    </StateProvider>
  );
}
