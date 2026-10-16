//! Shared data model serialized to the frontend.

use serde::{Deserialize, Serialize};

/// Role assigned to a detected Node-related process.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessKind {
    /// The executable itself is a Node-compatible runtime.
    Node,
    /// Package-manager launcher (npm / pnpm / yarn / corepack).
    Launcher,
    /// Non-Node executable whose command line references Node tooling.
    Related,
}

/// How confident we are that this process really is Node-related.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub name: String,
    pub exe: Option<String>,
    pub cmd: String,
    pub status: String,
    pub kind: ProcessKind,
    pub role: String,
    pub confidence: Confidence,
    pub start_time_secs: Option<u64>,
    pub run_time_secs: Option<u64>,
    pub cpu_percent: Option<f32>,
    pub mem_mb: Option<f64>,
    /// TCP ports this process is listening on.
    pub ports: Vec<u16>,
    /// Direct child PIDs present in the same snapshot.
    pub children: Vec<u32>,
    /// Best-effort project directory. CWD is not readable on Windows, so this
    /// is always inferred; `project_dir_source` explains how.
    pub project_dir: Option<String>,
    pub project_dir_source: Option<String>,
    pub is_listening: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SocketEntry {
    /// "tcp" or "udp"
    pub protocol: String,
    pub local_addr: String,
    pub port: u16,
    pub state: String,
    pub pids: Vec<u32>,
    pub process_names: Vec<String>,
    pub node_related: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertKind {
    DuplicateServers,
    ForeignPortOwner,
    LongRunning,
    OrphanCandidate,
    UnidentifiedOwner,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
}

#[derive(Debug, Clone, Serialize)]
pub struct Alert {
    /// Stable dismissal key.
    pub key: String,
    pub kind: AlertKind,
    pub severity: Severity,
    pub confidence: Confidence,
    pub title: String,
    pub detail: String,
    pub related_pids: Vec<u32>,
    pub related_ports: Vec<u16>,
    /// Structured facts so the UI can render localized text. Fallback is the
    /// English title/detail above.
    pub facts: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct SnapshotStats {
    pub node_processes: usize,
    pub listening_tcp: usize,
    pub duplicated_projects: usize,
    pub attention_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub generated_at_secs: u64,
    pub processes: Vec<ProcessInfo>,
    pub sockets: Vec<SocketEntry>,
    pub alerts: Vec<Alert>,
    pub stats: SnapshotStats,
    /// Non-fatal problems encountered while building the snapshot.
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessDetails {
    pub process: ProcessInfo,
    pub parent: Option<ProcessInfo>,
    pub children: Vec<ProcessInfo>,
    pub port_entries: Vec<SocketEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PortStatus {
    /// Port found in a consistent system-table snapshot.
    Listening { entry: SocketEntry },
    /// Snapshot succeeded and the port had no TCP listener.
    Free,
    /// Snapshot could not be trusted (system call failed or returned no data).
    Unknown { reason: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct KillResult {
    pub pid: u32,
    pub mode: String,
    pub include_tree: bool,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub auto_refresh: bool,
    pub refresh_interval_secs: u32,
    pub favorite_ports: Vec<u16>,
    pub long_running_threshold_hours: f64,
    pub show_udp: bool,
    pub dismissed_alert_keys: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            language: "en".into(),
            auto_refresh: true,
            refresh_interval_secs: 5,
            favorite_ports: vec![3000, 3001, 4000, 4173, 4200, 5000, 5173, 8000, 8080, 8081],
            long_running_threshold_hours: 24.0,
            show_udp: false,
            dismissed_alert_keys: Vec::new(),
        }
    }
}
