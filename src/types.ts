// Types mirroring the Rust backend model (serde camelCase / snake_case).

export type ProcessKind = "node" | "launcher" | "related";
export type Confidence = "high" | "medium" | "low";
export type Severity = "info" | "warning";
export type AlertKind = "duplicate_servers" | "foreign_port_owner" | "long_running" | "orphan_candidate" | "unidentified_owner";

export interface ProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  exe: string | null;
  cmd: string;
  status: string;
  kind: ProcessKind;
  role: string;
  confidence: Confidence;
  start_time_secs: number | null;
  run_time_secs: number | null;
  cpu_percent: number | null;
  mem_mb: number | null;
  ports: number[];
  children: number[];
  project_dir: string | null;
  project_dir_source: string | null;
  is_listening: boolean;
}

export interface SocketEntry {
  protocol: "tcp" | "udp";
  local_addr: string;
  port: number;
  state: string;
  pids: number[];
  process_names: string[];
  node_related: boolean;
}

export interface Alert {
  key: string;
  kind: AlertKind;
  severity: Severity;
  confidence: Confidence;
  title: string;
  detail: string;
  related_pids: number[];
  related_ports: number[];
  /** Structured facts from the backend for localized rendering. */
  facts: Record<string, unknown>;
}

export interface SnapshotStats {
  node_processes: number;
  listening_tcp: number;
  duplicated_projects: number;
  attention_count: number;
}

export interface Snapshot {
  generated_at_secs: number;
  processes: ProcessInfo[];
  sockets: SocketEntry[];
  alerts: Alert[];
  stats: SnapshotStats;
  errors: string[];
}

export interface ProcessDetails {
  process: ProcessInfo;
  parent: ProcessInfo | null;
  children: ProcessInfo[];
  port_entries: SocketEntry[];
}

export type PortStatus =
  | { status: "listening"; entry: SocketEntry }
  | { status: "free" }
  | { status: "unknown"; reason: string };

export interface KillResult {
  pid: number;
  mode: string;
  include_tree: boolean;
  success: boolean;
  message: string;
}

export interface AppSettings {
  theme: string;
  language: string;
  autoRefresh: boolean;
  refreshIntervalSecs: number;
  favoritePorts: number[];
  longRunningThresholdHours: number;
  showUdp: boolean;
  dismissedAlertKeys: string[];
}
