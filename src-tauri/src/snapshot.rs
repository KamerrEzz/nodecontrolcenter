//! Assemble a full system snapshot: processes, sockets, alerts and stats.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use crate::alerts;
use crate::detect::{self, Classification};
use crate::model::{AppSettings, ProcessInfo, Snapshot, SnapshotStats};
use crate::ports;

/// Long enough for sysinfo to compute CPU deltas between two refreshes.
const CPU_SAMPLE_INTERVAL: Duration = Duration::from_millis(220);

struct RawProcess {
    pid: u32,
    ppid: Option<u32>,
    name: String,
    exe: Option<String>,
    cmd: String,
    status: String,
    start_time_secs: Option<u64>,
    run_time_secs: Option<u64>,
    cpu_percent: Option<f32>,
    mem_mb: Option<f64>,
    environ_kvs: Vec<(String, String)>,
    classification: Option<Classification>,
}

/// Enumerate all processes and classify the Node-related ones.
///
/// Two refresh passes are used so CPU usage is a real delta, not a zero.
fn enumerate_processes() -> Vec<RawProcess> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    // Give sysinfo its minimum CPU sampling window, then take real numbers.
    std::thread::sleep(CPU_SAMPLE_INTERVAL);
    let refresh_kind = ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always).with_environ(UpdateKind::Always).with_exe(UpdateKind::Always);
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh_kind);

    let mut out = Vec::new();
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().into_owned();
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join(" ");
        let environ_kvs = detect::parse_environ(process.environ());
        let classification = detect::classify(&name, process.exe(), &cmd);
        // Skip early: full details are only worth collecting for Node-related
        // processes. We still keep everything needed for parent/child maps.
        out.push(RawProcess {
            pid: pid.as_u32(),
            ppid: process.parent().map(|p| p.as_u32()),
            name,
            exe: process.exe().map(|p| p.to_string_lossy().into_owned()),
            cmd,
            status: format!("{:?}", process.status()).to_lowercase(),
            start_time_secs: Some(process.start_time()),
            run_time_secs: Some(process.run_time()),
            cpu_percent: Some(process.cpu_usage()),
            mem_mb: Some(process.memory() as f64 / (1024.0 * 1024.0)),
            environ_kvs,
            classification,
        });
    }
    out
}

/// Build the complete snapshot. Errors are collected, never fatal.
pub fn build_snapshot(settings: &AppSettings) -> Snapshot {
    let mut errors: Vec<String> = Vec::new();

    let proc_joiner = std::thread::Builder::new().name("proc-scan".into()).spawn(enumerate_processes);
    let sock_joiner = std::thread::Builder::new().name("sock-scan".into()).spawn(ports::get_socket_entries);

    let raw_processes = match proc_joiner {
        Ok(handle) => match handle.join() {
            Ok(p) => p,
            Err(_) => {
                errors.push("process scan thread panicked".into());
                Vec::new()
            }
        },
        Err(e) => {
            errors.push(format!("could not spawn process scan: {e}"));
            Vec::new()
        }
    };
    let sockets_opt = match sock_joiner {
        Ok(handle) => match handle.join() {
            Ok(Ok(s)) => Some(s),
            Ok(Err(e)) => {
                errors.push(e);
                None
            }
            Err(_) => {
                errors.push("socket scan thread panicked".into());
                None
            }
        },
        Err(e) => {
            errors.push(format!("could not spawn socket scan: {e}"));
            None
        }
    };

    // Indexes over the raw list.
    let mut pid_to_idx: HashMap<u32, usize> = HashMap::new();
    for (i, p) in raw_processes.iter().enumerate() {
        pid_to_idx.insert(p.pid, i);
    }
    // children map (only direct children of Node-related processes matter,
    // but the full map is cheap and lets the UI render real trees).
    let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();
    for p in &raw_processes {
        if let Some(ppid) = p.ppid {
            children_map.entry(ppid).or_default().push(p.pid);
        }
    }

    // Sockets (annotated later, once we know which PIDs are Node-related).
    let mut sockets = sockets_opt.unwrap_or_default();
    let tcp_listen: Vec<(u32, u16)> = sockets
        .iter()
        .filter(|e| e.protocol == "tcp" && e.state == "listen")
        .flat_map(|e| e.pids.iter().map(move |&pid| (pid, e.port)))
        .collect();

    // Build ProcessInfo for Node-related processes only; keep a side map of
    // names for socket annotation and parent lookup.
    let mut node_pids: HashSet<u32> = HashSet::new();
    let mut names: HashMap<u32, String> = HashMap::new();
    let mut processes: Vec<ProcessInfo> = Vec::new();

    for p in &raw_processes {
        names.insert(p.pid, p.name.clone());
        let Some(classification) = &p.classification else { continue };
        node_pids.insert(p.pid);

        let mut listen_ports: Vec<u16> = tcp_listen.iter().filter(|(pid, _)| *pid == p.pid).map(|(_, port)| *port).collect();
        listen_ports.sort_unstable();
        listen_ports.dedup();

        let (project_dir, project_dir_source) = match detect::infer_project_dir(&p.cmd, &p.environ_kvs) {
            Some((dir, source)) => (
                Some(dir),
                Some(match source {
                    detect::DirSource::Environment(var) => format!("environment variable {var} (inferred)"),
                    detect::DirSource::CommandLine => "command line (inferred)".to_string(),
                }),
            ),
            None => (None, None),
        };
        let is_listening = !listen_ports.is_empty();

        processes.push(ProcessInfo {
            pid: p.pid,
            ppid: p.ppid,
            name: p.name.clone(),
            exe: p.exe.clone(),
            cmd: p.cmd.clone(),
            status: p.status.clone(),
            kind: classification.kind,
            role: classification.role.clone(),
            confidence: classification.confidence,
            start_time_secs: p.start_time_secs,
            run_time_secs: p.run_time_secs,
            cpu_percent: p.cpu_percent,
            mem_mb: p.mem_mb,
            ports: listen_ports,
            children: children_map.get(&p.pid).cloned().unwrap_or_default(),
            project_dir,
            project_dir_source,
            is_listening: is_listening,
        });
    }

    ports::annotate_sockets(&mut sockets, &names, &node_pids);

    let alerts = alerts::compute_alerts(&processes, &sockets, settings);

    let duplicated_projects = count_duplicated_projects(&processes);
    let stats = SnapshotStats {
        node_processes: processes.len(),
        listening_tcp: sockets.iter().filter(|e| e.protocol == "tcp" && e.state == "listen").count(),
        duplicated_projects,
        attention_count: alerts.iter().filter(|a| a.severity == crate::model::Severity::Warning).count(),
    };

    let generated_at_secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);

    Snapshot {
        generated_at_secs,
        processes,
        sockets,
        alerts,
        stats,
        errors,
    }
}

/// Projects with two or more Node processes listening at the same time.
fn count_duplicated_projects(processes: &[ProcessInfo]) -> usize {
    let mut by_dir: HashMap<&str, usize> = HashMap::new();
    for p in processes {
        if p.is_listening {
            if let Some(dir) = &p.project_dir {
                *by_dir.entry(dir.as_str()).or_default() += 1;
            }
        }
    }
    by_dir.values().filter(|&&c| c >= 2).count()
}

/// Collect full details for one PID from a fresh snapshot.
pub fn process_details(pid: u32) -> Result<ProcessDetailsInfo, String> {
    let snapshot = build_snapshot(&AppSettings::default());
    let proc = snapshot
        .processes
        .iter()
        .find(|p| p.pid == pid)
        .ok_or_else(|| format!("process {pid} not found or not Node-related"))?
        .clone();

    let parent = proc
        .ppid
        .and_then(|ppid| snapshot.processes.iter().find(|p| p.pid == ppid).cloned());
    let children: Vec<ProcessInfo> = snapshot
        .processes
        .iter()
        .filter(|p| proc.children.contains(&p.pid))
        .cloned()
        .collect();
    let port_entries: Vec<crate::model::SocketEntry> = snapshot
        .sockets
        .iter()
        .filter(|e| proc.ports.contains(&e.port) && e.protocol == "tcp")
        .cloned()
        .collect();

    Ok(ProcessDetailsInfo {
        process: proc,
        parent,
        children,
        port_entries,
    })
}

pub struct ProcessDetailsInfo {
    pub process: ProcessInfo,
    pub parent: Option<ProcessInfo>,
    pub children: Vec<ProcessInfo>,
    pub port_entries: Vec<crate::model::SocketEntry>,
}
