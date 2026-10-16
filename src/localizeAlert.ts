// Localized alert rendering: the backend sends structured facts, the UI
// builds human text in the active language. Falls back to the backend's
// English text when facts are missing.

import type { Alert } from "./types";
import type { Dict } from "./i18n";
import { formatUptime } from "./format";

export interface LocalizedAlert {
  title: string;
  detail: string;
}

export function localizeAlert(
  alert: Alert,
  t: Dict,
  tr: (template: string, vars: Record<string, string | number>) => string,
): LocalizedAlert {
  const f = (alert.facts ?? {}) as Record<string, unknown>;
  const str = (k: string) => (f[k] == null ? "" : String(f[k]));

  switch (alert.kind) {
    case "duplicate_servers":
      if (!f.project_dir) return alert;
      return {
        title: tr(t.alerts.duplicateServersTitle, { count: Number(f.count ?? alert.related_pids.length) }),
        detail: tr(t.alerts.duplicateServersDetail, {
          dir: str("project_dir"),
          count: Number(f.count ?? alert.related_pids.length),
          ports: str("ports") || alert.related_ports.join(", "),
        }),
      };
    case "foreign_port_owner":
      if (f.port == null) return alert;
      return {
        title: tr(t.alerts.foreignPortTitle, { port: Number(f.port) }),
        detail: tr(t.alerts.foreignPortDetail, {
          port: Number(f.port),
          pids: Array.isArray(f.pids) ? (f.pids as number[]).join(", ") : alert.related_pids.join(", "),
          names: Array.isArray(f.names) ? (f.names as string[]).join(", ") : "unknown",
        }),
      };
    case "long_running":
      if (f.run_time_secs == null) return alert;
      return {
        title: tr(t.alerts.longRunningTitle, { pid: Number(f.pid), duration: formatUptime(Number(f.run_time_secs)) }),
        detail: tr(t.alerts.longRunningDetail, {
          pid: Number(f.pid),
          name: str("name"),
          duration: formatUptime(Number(f.run_time_secs)),
        }),
      };
    case "orphan_candidate":
      if (f.parent_pid == null) return alert;
      return {
        title: tr(t.alerts.orphanTitle, { pid: Number(f.pid) }),
        detail: tr(t.alerts.orphanDetail, { pid: Number(f.pid), name: str("name"), parent: Number(f.parent_pid) }),
      };
    case "unidentified_owner":
      if (f.port == null) return alert;
      return {
        title: tr(t.alerts.unidentifiedTitle, { port: Number(f.port) }),
        detail: tr(t.alerts.unidentifiedDetail, { addr: str("local_addr"), port: Number(f.port) }),
      };
  }
}
