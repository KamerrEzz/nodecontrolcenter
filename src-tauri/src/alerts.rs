//! Explainable alert rules. Every alert states observed facts and a confidence
//! level — we never call a process "malicious" or "orphan" without evidence.

use std::collections::HashMap;

use serde_json::json;

use crate::model::{Alert, AlertKind, AppSettings, Confidence, ProcessInfo, Severity, SocketEntry};

fn key(kind: &str, subject: &str) -> String {
    format!("{kind}:{subject}")
}

fn format_duration(secs: u64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 {
        format!("{h}h {m}m")
    } else {
        format!("{m}m")
    }
}

pub fn compute_alerts(processes: &[ProcessInfo], sockets: &[SocketEntry], settings: &AppSettings) -> Vec<Alert> {
    let mut alerts = Vec::new();

    // 1) Several Node servers listening for the same project directory.
    let mut by_dir: HashMap<&str, Vec<&ProcessInfo>> = HashMap::new();
    for p in processes {
        if p.is_listening {
            if let Some(dir) = &p.project_dir {
                by_dir.entry(dir.as_str()).or_default().push(p);
            }
        }
    }
    for (dir, procs) in &by_dir {
        if procs.len() >= 2 {
            let pids: Vec<u32> = procs.iter().map(|p| p.pid).collect();
            let ports: Vec<u16> = procs.iter().flat_map(|p| p.ports.iter().copied()).collect::<std::collections::BTreeSet<_>>().into_iter().collect();
            alerts.push(Alert {
                key: key("dup", dir),
                kind: AlertKind::DuplicateServers,
                severity: Severity::Warning,
                confidence: Confidence::Medium,
                title: format!("{} processes are listening on the same project", procs.len()),
                detail: format!(
                    "Directory {} has {} Node processes with listening ports ({}). The project directory was inferred from their command lines, so they may belong to different worktrees of the same project.",
                    dir,
                    procs.len(),
                    ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ")
                ),
                related_pids: pids,
                related_ports: ports.iter().copied().collect(),
                facts: json!({ "project_dir": dir, "count": procs.len(), "ports": ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ") }),
            });
        }
    }

    // 2) A favorite/expected port is owned by a non-Node process.
    let node_pid_set: std::collections::HashSet<u32> = processes.iter().map(|p| p.pid).collect();
    for port in &settings.favorite_ports {
        if let Some(entry) = sockets.iter().find(|e| e.protocol == "tcp" && e.state == "listen" && e.port == *port) {
            let owner_is_node = entry.pids.iter().any(|pid| node_pid_set.contains(pid));
            if !owner_is_node && !entry.pids.is_empty() {
                let pids: Vec<u32> = entry.pids.clone();
                alerts.push(Alert {
                    key: key("foreignport", &port.to_string()),
                    kind: AlertKind::ForeignPortOwner,
                    severity: Severity::Warning,
                    confidence: Confidence::High,
                    title: format!("Port {port} is occupied by a non-Node process"),
                    detail: format!(
                        "Port {port} is being listened on by PID {} ({}). If you expected one of your dev servers there, it is not the one holding the port.",
                        pids.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", "),
                        entry.process_names.join(", ")
                    ),
                    related_pids: pids.clone(),
                    related_ports: vec![*port],
                    facts: json!({ "port": port, "pids": pids, "names": entry.process_names }),
                });
            }
        }
    }

    // 3) Long-running Node server.
    let threshold_secs = (settings.long_running_threshold_hours * 3600.0) as u64;
    for p in processes {
        if let Some(rt) = p.run_time_secs {
            if p.is_listening && rt >= threshold_secs {
                alerts.push(Alert {
                    key: key("longrun", &p.pid.to_string()),
                    kind: AlertKind::LongRunning,
                    severity: Severity::Info,
                    confidence: Confidence::High,
                    title: format!("PID {} has been running for {}", p.pid, format_duration(rt)),
                    detail: format!(
                        "PID {} ({}) has been listening for {}. This is an observed fact, not a problem by itself: long-lived dev servers are only unexpected if you thought you had closed them.",
                        p.pid, p.name, format_duration(rt)
                    ),
                    related_pids: vec![p.pid],
                    related_ports: p.ports.clone(),
                    facts: json!({ "pid": p.pid, "name": p.name, "run_time_secs": rt }),
                });
            }
        }
    }

    // 4) Node process whose parent no longer exists in the process table.
    let all_pids: std::collections::HashSet<u32> = processes.iter().map(|p| p.pid).collect();
    for p in processes {
        if let Some(ppid) = p.ppid {
            if !all_pids.contains(&ppid) && !p.is_listening {
                alerts.push(Alert {
                    key: key("orphan", &p.pid.to_string()),
                    kind: AlertKind::OrphanCandidate,
                    severity: Severity::Info,
                    confidence: Confidence::Low,
                    title: format!("PID {} launcher is no longer running", p.pid),
                    detail: format!(
                        "PID {} ({}) reports parent PID {}, which is not in the current process table. This can mean an orphaned process, or that the parent exited normally after spawning it.",
                        p.pid, p.name, ppid
                    ),
                    related_pids: vec![p.pid],
                    related_ports: Vec::new(),
                    facts: json!({ "pid": p.pid, "name": p.name, "parent_pid": ppid }),
                });
            }
        }
    }

    // 5) Listening socket whose owner cannot be identified.
    for e in sockets {
        if e.protocol == "tcp" && e.state == "listen" && e.pids.is_empty() {
            alerts.push(Alert {
                key: key("unidentified", &format!("{}:{}", e.port, e.local_addr)),
                kind: AlertKind::UnidentifiedOwner,
                severity: Severity::Info,
                confidence: Confidence::Low,
                title: format!("Port {} has no identifiable owner", e.port),
                detail: format!(
                    "A TCP socket is listening on {}:{} but the system did not report an owning PID. This usually requires elevated permissions to resolve, or the process exited during the query.",
                    e.local_addr, e.port
                ),
                related_pids: Vec::new(),
                related_ports: vec![e.port],
                facts: json!({ "port": e.port, "local_addr": e.local_addr }),
            });
        }
    }

    alerts
}

/// Remove dismissed keys and return the visible alerts.
pub fn apply_dismissals(alerts: Vec<Alert>, settings: &AppSettings) -> Vec<Alert> {
    let dismissed: std::collections::HashSet<&String> = settings.dismissed_alert_keys.iter().collect();
    alerts.into_iter().filter(|a| !dismissed.contains(&a.key)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ProcessKind, Confidence};

    fn proc(pid: u32, ppid: Option<u32>, name: &str, ports: Vec<u16>, dir: Option<&str>) -> ProcessInfo {
        ProcessInfo {
            pid,
            ppid,
            name: name.into(),
            exe: None,
            cmd: format!("node server-{pid}.js"),
            status: "run".into(),
            kind: ProcessKind::Node,
            role: "runtime".into(),
            confidence: Confidence::High,
            start_time_secs: Some(1_000_000),
            run_time_secs: Some(60),
            cpu_percent: Some(0.1),
            mem_mb: Some(50.0),
            ports: ports.clone(),
            children: Vec::new(),
            project_dir: dir.map(|d| d.into()),
            project_dir_source: dir.map(|_| "test".into()),
            is_listening: !ports.is_empty(),
        }
    }

    fn sock(port: u16, pids: Vec<u32>, state: &str) -> SocketEntry {
        SocketEntry {
            protocol: "tcp".into(),
            local_addr: "0.0.0.0".into(),
            port,
            state: state.into(),
            pids,
            process_names: Vec::new(),
            node_related: false,
        }
    }

    #[test]
    fn duplicate_servers_in_same_project() {
        let procs = vec![
            proc(1, None, "node.exe", vec![3000], Some("D:\\proj\\a")),
            proc(2, None, "node.exe", vec![3001], Some("D:\\proj\\a")),
        ];
        let alerts = compute_alerts(&procs, &[], &AppSettings::default());
        assert!(alerts.iter().any(|a| a.kind == AlertKind::DuplicateServers));
    }

    #[test]
    fn no_duplicate_alert_for_different_projects() {
        let procs = vec![
            proc(1, None, "node.exe", vec![3000], Some("D:\\proj\\a")),
            proc(2, None, "node.exe", vec![3001], Some("D:\\proj\\b")),
        ];
        let alerts = compute_alerts(&procs, &[], &AppSettings::default());
        assert!(!alerts.iter().any(|a| a.kind == AlertKind::DuplicateServers));
    }

    #[test]
    fn foreign_port_owner_alert() {
        // A non-Node owner: production only includes Node-related processes in
        // the process list, so the foreign PID must not appear there.
        let sockets = vec![sock(5173, vec![99], "listen")];
        let mut settings = AppSettings::default();
        settings.favorite_ports = vec![5173];
        let alerts = compute_alerts(&[], &sockets, &settings);
        let a = alerts.iter().find(|a| a.kind == AlertKind::ForeignPortOwner).expect("foreign owner alert");
        assert_eq!(a.related_ports, vec![5173]);
        assert_eq!(a.confidence, Confidence::High);
    }

    #[test]
    fn no_foreign_alert_when_owner_is_node() {
        let procs = vec![proc(1, None, "node.exe", vec![5173], None)];
        let sockets = vec![sock(5173, vec![1], "listen")];
        let mut settings = AppSettings::default();
        settings.favorite_ports = vec![5173];
        let alerts = compute_alerts(&procs, &sockets, &settings);
        assert!(!alerts.iter().any(|a| a.kind == AlertKind::ForeignPortOwner));
    }

    #[test]
    fn long_running_alert_respects_threshold() {
        let mut p = proc(1, None, "node.exe", vec![3000], None);
        p.run_time_secs = Some(25 * 3600);
        let alerts = compute_alerts(&[p], &[], &AppSettings::default());
        assert!(alerts.iter().any(|a| a.kind == AlertKind::LongRunning));

        let mut p = proc(2, None, "node.exe", vec![3000], None);
        p.run_time_secs = Some(60);
        let alerts = compute_alerts(&[p], &[], &AppSettings::default());
        assert!(!alerts.iter().any(|a| a.kind == AlertKind::LongRunning));
    }

    #[test]
    fn orphan_candidate_when_parent_vanished() {
        let procs = vec![proc(5, Some(999), "node.exe", vec![], None)];
        let alerts = compute_alerts(&procs, &[], &AppSettings::default());
        let a = alerts.iter().find(|a| a.kind == AlertKind::OrphanCandidate).expect("orphan alert");
        assert_eq!(a.confidence, Confidence::Low);
    }

    #[test]
    fn unidentified_owner_alert_for_pidless_listener() {
        let sockets = vec![sock(9999, vec![], "listen")];
        let alerts = compute_alerts(&[], &sockets, &AppSettings::default());
        assert!(alerts.iter().any(|a| a.kind == AlertKind::UnidentifiedOwner));
    }

    #[test]
    fn dismissals_hide_alerts() {
        let mut p = proc(1, None, "node.exe", vec![3000], Some("D:\\proj\\a"));
        let mut p2 = proc(2, None, "node.exe", vec![3001], Some("D:\\proj\\a"));
        p.run_time_secs = Some(25 * 3600);
        p2.run_time_secs = Some(25 * 3600);
        let alerts = compute_alerts(&[p, p2], &[], &AppSettings::default());
        assert!(!alerts.is_empty());
        // Dismiss every generated key -> nothing visible.
        let keys = alerts.iter().map(|a| a.key.clone()).collect();
        let settings = AppSettings { dismissed_alert_keys: keys, ..Default::default() };
        assert!(apply_dismissals(alerts, &settings).is_empty());
    }
}
