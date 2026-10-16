// Confirmation dialog for process termination. Pure UI: all validation and
// execution happen in the Rust backend.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "../useI18n";
import { toast } from "../toast";
import * as api from "../api";
import type { ProcessInfo } from "../types";
import { formatUptime, truncateCmd } from "../format";

export interface KillRequest {
  process: ProcessInfo;
  childPids: number[];
}

export function KillDialog({ request, onClose, onDone }: { request: KillRequest; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { process, childPids } = request;
  const [mode, setMode] = useState<"graceful" | "force">("graceful");
  const [includeTree, setIncludeTree] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const confirmed = confirmText.trim().toLowerCase() === process.pid.toString();
  const canSubmit = confirmed && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api.terminateProcess(process.pid, mode, includeTree);
      setResult(res.message);
      if (res.success) {
        toast(res.message, "ok");
        onDone();
      }
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog" role="dialog" aria-modal>
        <h2>
          <AlertTriangle size={17} /> {t.kill.title.replace("{pid}", process.pid.toString())}
        </h2>
        <p className="dialog-sub">{t.kill.subtitle}</p>

        <div className="cmd-block">{truncateCmd(process.cmd || process.name, 300)}</div>

        <dl className="kv">
          <dt>{t.kill.pid}</dt>
          <dd className="mono">{process.pid}</dd>
          <dt>{t.kill.executable}</dt>
          <dd>{process.exe ?? process.name}</dd>
          <dt>{t.kill.projectDir}</dt>
          <dd>{process.project_dir ?? t.common.notAvailableLong}</dd>
          <dt>{t.kill.listeningOn}</dt>
          <dd>{process.ports.length ? process.ports.join(", ") : t.kill.noPorts}</dd>
          <dt>{t.kill.uptime}</dt>
          <dd>{formatUptime(process.run_time_secs, t.common.notAvailable)}</dd>
          <dt>{t.kill.childProcesses}</dt>
          <dd>{childPids.length ? t.kill.childrenSome.replace("{n}", childPids.length.toString()).replace("{pids}", childPids.join(", ")) : t.kill.childrenNone}</dd>
        </dl>

        <div className="radio-row">
          <label className={`radio-option ${mode === "graceful" ? "selected" : ""}`}>
            <input type="radio" checked={mode === "graceful"} onChange={() => setMode("graceful")} />
            <div>
              <div className="radio-title">{t.kill.graceful}</div>
              <div className="radio-desc">{t.kill.gracefulDesc}</div>
            </div>
          </label>
          <label className={`radio-option ${mode === "force" ? "selected" : ""}`}>
            <input type="radio" checked={mode === "force"} onChange={() => setMode("force")} />
            <div>
              <div className="radio-title">{t.kill.force}</div>
              <div className="radio-desc">{t.kill.forceDesc}</div>
            </div>
          </label>
          <label className={`radio-option ${includeTree ? "selected" : ""}`}>
            <input type="checkbox" checked={includeTree} onChange={() => setIncludeTree((v) => !v)} />
            <div>
              <div className="radio-title">{t.kill.includeTree}</div>
              <div className="radio-desc">
                {childPids.length ? t.kill.treeSome.replace("{n}", childPids.length.toString()) : t.kill.treeNone}
              </div>
            </div>
          </label>
        </div>

        <p className="dialog-sub" style={{ marginBottom: 6 }}>
          {t.kill.confirmPrompt.replace("{pid}", process.pid.toString())}
        </p>
        <input
          type="text"
          className="setting-input"
          style={{ width: "160px" }}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={process.pid.toString()}
          autoFocus
          disabled={busy}
        />

        {result && <p className="dialog-sub" style={{ marginTop: 10 }}>{result}</p>}

        <div className="dialog-footer">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button className="btn danger" onClick={submit} disabled={!canSubmit}>
            {busy ? <span className="spinner" /> : t.kill.terminate}
          </button>
        </div>
      </div>
    </div>
  );
}
