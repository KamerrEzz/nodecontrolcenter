// Thin, typed wrappers around Tauri commands. The frontend has no shell
// access and can only call these validated commands.
//
// Browser preview mode: when running outside the Tauri runtime (plain
// browser, used only for UI development and documentation screenshots), a
// mock backend serves clearly synthetic data. Inside the packaged app the
// Tauri runtime is always present and the mock path is never taken; the
// mocks also hard-fail if that ever changes.

import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, KillResult, PortStatus, ProcessDetails, ProcessInfo, Snapshot, SocketEntry } from "./types";

const IN_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function proc(p: Partial<ProcessInfo> & { pid: number }): ProcessInfo {
  return {
    ppid: null,
    name: "node.exe",
    exe: "C:\\Program Files\\nodejs\\node.exe",
    cmd: "node server.js",
    status: "run",
    kind: "node",
    role: "runtime",
    confidence: "high",
    start_time_secs: Math.floor(Date.now() / 1000) - 3600,
    run_time_secs: 3600,
    cpu_percent: 0.4,
    mem_mb: 92.3,
    ports: [],
    children: [],
    project_dir: null,
    project_dir_source: null,
    is_listening: false,
    ...p,
  };
}

const MOCK_SNAPSHOT: Snapshot = {
  generated_at_secs: Math.floor(Date.now() / 1000),
  processes: [
    proc({
      pid: 14872,
      cmd: 'node D:\\CODE\\projects\\acme-store\\node_modules\\vite\\bin\\vite.js --port 5173 --host',
      ports: [5173],
      project_dir: "D:\\CODE\\projects\\acme-store",
      project_dir_source: "command line (inferred)",
      role: "tool",
      is_listening: true,
      run_time_secs: 18_540,
      cpu_percent: 1.2,
      mem_mb: 214.8,
      children: [14900, 14934],
    }),
    proc({
      pid: 14900,
      ppid: 14872,
      cmd: "node --experimental-loader esbuild-loader worker.js",
      role: "worker",
      cpu_percent: 0.3,
      mem_mb: 68.1,
      project_dir: "D:\\CODE\\projects\\acme-store",
      project_dir_source: "command line (inferred)",
      run_time_secs: 18_512,
    }),
    proc({
      pid: 14934,
      ppid: 14872,
      cmd: 'node D:\\CODE\\projects\\acme-store\\node_modules\\esbuild\\bin\\esbuild --service',
      role: "tool",
      cpu_percent: 0.1,
      mem_mb: 41.5,
      project_dir: "D:\\CODE\\projects\\acme-store",
      project_dir_source: "command line (inferred)",
      run_time_secs: 18_510,
    }),
    proc({
      pid: 9412,
      cmd: 'node C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js run dev --workspace api',
      role: "launcher",
      cpu_percent: 0.2,
      mem_mb: 58.4,
      project_dir: "D:\\CODE\\projects\\acme-api",
      project_dir_source: "environment variable INIT_CWD (inferred)",
      run_time_secs: 96_120,
    }),
    proc({
      pid: 9460,
      ppid: 9412,
      cmd: 'node D:\\CODE\\projects\\acme-api\\dist\\server.js',
      ports: [3000],
      project_dir: "D:\\CODE\\projects\\acme-api",
      project_dir_source: "command line (inferred)",
      is_listening: true,
      run_time_secs: 95_880,
      cpu_percent: 0.8,
      mem_mb: 176.2,
    }),
    proc({
      pid: 9461,
      ppid: 9412,
      cmd: 'node D:\\CODE\\projects\\acme-api\\dist\\worker.js',
      project_dir: "D:\\CODE\\projects\\acme-api",
      project_dir_source: "command line (inferred)",
      cpu_percent: 0.05,
      mem_mb: 44.9,
    }),
    proc({
      pid: 7734,
      cmd: "node playground.ts --watch",
      ports: [4000],
      project_dir: "C:\\Users\\dev\\playground",
      project_dir_source: "command line (inferred)",
      is_listening: true,
      cpu_percent: 0.6,
      mem_mb: 88.7,
      run_time_secs: 4_210,
    }),
  ],
  sockets: [
    { protocol: "tcp", local_addr: "127.0.0.1", port: 3000, state: "listen", pids: [9460], process_names: ["node.exe"], node_related: true },
    { protocol: "tcp", local_addr: "0.0.0.0", port: 4000, state: "listen", pids: [7734], process_names: ["node.exe"], node_related: true },
    { protocol: "tcp", local_addr: "0.0.0.0", port: 5173, state: "listen", pids: [14872], process_names: ["node.exe"], node_related: true },
    { protocol: "tcp", local_addr: "127.0.0.1", port: 5432, state: "listen", pids: [3908], process_names: ["postgres.exe"], node_related: false },
    { protocol: "tcp", local_addr: "0.0.0.0", port: 8080, state: "listen", pids: [2216], process_names: ["httpd.exe"], node_related: false },
    { protocol: "tcp", local_addr: "127.0.0.1", port: 9229, state: "listen", pids: [9460], process_names: ["node.exe"], node_related: true },
    { protocol: "udp", local_addr: "0.0.0.0", port: 5353, state: "udp", pids: [1044], process_names: ["svchost.exe"], node_related: false },
  ] satisfies SocketEntry[],
  alerts: [
    {
      key: "dup:acme-store",
      kind: "duplicate_servers",
      severity: "warning",
      confidence: "medium",
      title: "",
      detail: "",
      related_pids: [14872],
      related_ports: [5173],
      facts: { project_dir: "D:\\CODE\\projects\\acme-store", count: 3, ports: "5173" },
    },
    {
      key: "foreignport:5432",
      kind: "foreign_port_owner",
      severity: "warning",
      confidence: "high",
      title: "",
      detail: "",
      related_pids: [3908],
      related_ports: [5432],
      facts: { port: 5432, pids: [3908], names: ["postgres.exe"] },
    },
    {
      key: "longrun:9460",
      kind: "long_running",
      severity: "info",
      confidence: "high",
      title: "",
      detail: "",
      related_pids: [9460],
      related_ports: [3000],
      facts: { pid: 9460, name: "node.exe", run_time_secs: 95_880 },
    },
  ],
  stats: { node_processes: 7, listening_tcp: 5, duplicated_projects: 1, attention_count: 2 },
  errors: [],
};

const MOCK_SETTINGS: AppSettings = {
  theme: "dark",
  language: "es",
  autoRefresh: false,
  refreshIntervalSecs: 5,
  favoritePorts: [3000, 3001, 4000, 4173, 4200, 5000, 5173, 8000, 8080, 8081],
  longRunningThresholdHours: 24,
  showUdp: false,
  dismissedAlertKeys: [],
};

function mockOrThrow<T>(value: T): Promise<T> {
  if (IN_TAURI) throw new Error("mock backend used inside Tauri runtime");
  return Promise.resolve(value);
}

export function getSnapshot(): Promise<Snapshot> {
  if (!IN_TAURI) return mockOrThrow({ ...MOCK_SNAPSHOT, generated_at_secs: Math.floor(Date.now() / 1000) });
  return invoke("get_snapshot");
}

export function getProcessDetails(pid: number): Promise<ProcessDetails> {
  if (!IN_TAURI) {
    const process = MOCK_SNAPSHOT.processes.find((p) => p.pid === pid);
    if (!process) return Promise.reject(`process ${pid} not found`);
    return mockOrThrow({
      process,
      parent: process.ppid ? MOCK_SNAPSHOT.processes.find((p) => p.pid === process.ppid) ?? null : null,
      children: MOCK_SNAPSHOT.processes.filter((p) => process.children.includes(p.pid)),
      port_entries: MOCK_SNAPSHOT.sockets.filter((e) => process.ports.includes(e.port)),
    });
  }
  return invoke("get_process_details", { pid });
}

export function getPortStatus(port: number): Promise<PortStatus> {
  if (!IN_TAURI) {
    const entry = MOCK_SNAPSHOT.sockets.find((e) => e.protocol === "tcp" && e.port === port && e.state === "listen");
    if (entry) return mockOrThrow({ status: "listening", entry });
    return mockOrThrow({ status: "free" });
  }
  return invoke("get_port_status", { port });
}

export function terminateProcess(pid: number, mode: "graceful" | "force", includeTree: boolean): Promise<KillResult> {
  return invoke("terminate_process", { pid, mode, includeTree });
}

export function openInExplorer(path: string): Promise<void> {
  return invoke("open_in_explorer", { path });
}

export function getSettings(): Promise<AppSettings> {
  if (!IN_TAURI) return mockOrThrow({ ...MOCK_SETTINGS });
  return invoke("get_settings");
}

export function saveSettings(settings: AppSettings): Promise<AppSettings> {
  if (!IN_TAURI) return mockOrThrow({ ...settings });
  return invoke("save_settings", { settings });
}

export function dismissAlert(key: string): Promise<void> {
  if (!IN_TAURI) return mockOrThrow(undefined);
  return invoke("dismiss_alert", { key });
}

export function restoreDismissedAlerts(): Promise<void> {
  if (!IN_TAURI) return mockOrThrow(undefined);
  return invoke("restore_dismissed_alerts");
}
