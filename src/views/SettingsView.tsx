import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppState } from "../hooks/useAppState";
import { useI18n } from "../useI18n";
import { LANGUAGES } from "../i18n";

export function SettingsView() {
  const { settings, updateSettings } = useAppState();
  const { t, tr } = useI18n();
  const [newPort, setNewPort] = useState("");

  if (!settings) return null;

  function addFavoritePort() {
    if (!settings) return;
    const p = Number.parseInt(newPort, 10);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return;
    if (!settings.favoritePorts.includes(p)) {
      updateSettings({ favoritePorts: [...settings.favoritePorts, p] });
    }
    setNewPort("");
  }

  return (
    <div className="main" style={{ gridTemplateRows: "auto 1fr" }}>
      <div className="view-header">
        <h1>{t.settings.title}</h1>
        <span className="count">{t.settings.storedLocally}</span>
      </div>

      <div className="settings-grid">
        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.language}</h3>
            <p>{t.settings.languageDesc}</p>
          </div>
          <select
            className="setting-input"
            value={settings.language}
            onChange={(e) => updateSettings({ language: e.target.value })}
            style={{ width: 130 }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.theme}</h3>
            <p>{t.settings.themeDesc}</p>
          </div>
          <select
            className="setting-input"
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value })}
            style={{ width: 110 }}
          >
            <option value="dark">{t.settings.themeDark}</option>
            <option value="light">{t.settings.themeLight}</option>
          </select>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.autoRefresh}</h3>
            <p>{t.settings.autoRefreshDesc}</p>
          </div>
          <div
            className={`toggle ${settings.autoRefresh ? "on" : ""}`}
            role="switch"
            aria-checked={settings.autoRefresh}
            onClick={() => updateSettings({ autoRefresh: !settings.autoRefresh })}
          />
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.refreshInterval}</h3>
            <p>{t.settings.refreshIntervalDesc}</p>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={settings.refreshIntervalSecs}
            onChange={(e) => updateSettings({ refreshIntervalSecs: Number(e.target.value) })}
          />
          <span className="mono" style={{ width: 42, textAlign: "right" }}>
            {settings.refreshIntervalSecs}s
          </span>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.favoritePorts}</h3>
            <p>{t.settings.favoritePortsDesc}</p>
            <div className="tag-list">
              {settings.favoritePorts.map((p) => (
                <span key={p} className="tag">
                  {p}
                  <button title={tr(t.settings.removePort, { port: p })} onClick={() => updateSettings({ favoritePorts: settings.favoritePorts.filter((x) => x !== p) })}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              className="setting-input"
              placeholder={t.ports.colPort.toLowerCase()}
              value={newPort}
              inputMode="numeric"
              onChange={(e) => setNewPort(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && addFavoritePort()}
            />
            <button className="btn icon-only" onClick={addFavoritePort} title={t.settings.addPort}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.longRunning}</h3>
            <p>{t.settings.longRunningDesc}</p>
          </div>
          <input
            type="number"
            min={1}
            max={720}
            value={settings.longRunningThresholdHours}
            onChange={(e) => updateSettings({ longRunningThresholdHours: Math.max(1, Number(e.target.value) || 24) })}
          />
          <span style={{ color: "var(--text-muted)" }}>{t.settings.hours}</span>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.showUdp}</h3>
            <p>{t.settings.showUdpDesc}</p>
          </div>
          <div
            className={`toggle ${settings.showUdp ? "on" : ""}`}
            role="switch"
            aria-checked={settings.showUdp}
            onClick={() => updateSettings({ showUdp: !settings.showUdp })}
          />
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>{t.settings.privacy}</h3>
            <p>{t.settings.privacyDesc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}