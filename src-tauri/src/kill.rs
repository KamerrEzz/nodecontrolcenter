//! Process termination. Frontend never gets shell access: this module is the
//! only path to a kill, and it re-validates the PID against live system data
//! right before acting.

use std::process::Command;

use crate::detect;
use crate::model::KillResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KillMode {
    /// `taskkill /PID n` — asks the process to exit first.
    Graceful,
    /// `taskkill /F /T /PID n` — forced, includes the child tree.
    Force,
}

impl KillMode {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "graceful" => Some(Self::Graceful),
            "force" => Some(Self::Force),
            _ => None,
        }
    }
}

/// Build the exact taskkill argument vector (unit-tested).
pub fn build_kill_args(pid: u32, mode: KillMode, include_tree: bool) -> Vec<String> {
    let mut args = Vec::new();
    match mode {
        KillMode::Graceful => {
            args.push("/PID".into());
            args.push(pid.to_string());
            if include_tree {
                // /T only makes sense with force for reliable tree teardown;
                // graceful tree kill is still honored on live children.
                args.insert(0, "/T".into());
            }
        }
        KillMode::Force => {
            args.push("/F".into());
            if include_tree {
                args.push("/T".into());
            }
            args.push("/PID".into());
            args.push(pid.to_string());
        }
    }
    args
}

/// Terminate a Node-related process after live re-validation.
///
/// Safety rules enforced here (not in the UI):
/// - the PID must exist right now,
/// - it must classify as Node-related,
/// - it must not be a protected system process,
/// - it must not be our own process.
pub fn terminate(pid: u32, mode: KillMode, include_tree: bool) -> KillResult {
    let base = KillResult {
        pid,
        mode: match mode {
            KillMode::Graceful => "graceful".into(),
            KillMode::Force => "force".into(),
        },
        include_tree,
        success: false,
        message: String::new(),
    };

    if pid == std::process::id() {
        return KillResult {
            message: "refusing to terminate our own process".into(),
            ..base
        };
    }

    // Live re-validation: the process must still exist and be Node-related.
    let snapshot = crate::snapshot::build_snapshot(&Default::default());
    let target = match snapshot.processes.iter().find(|p| p.pid == pid) {
        Some(p) => p.clone(),
        None => {
            return KillResult {
                message: format!("process {pid} does not exist or is not Node-related; nothing was terminated"),
                ..base
            }
        }
    };
    if detect::is_protected_system_name(&target.name) {
        return KillResult {
            message: format!("process {pid} ({}) is a protected system process; refusing", target.name),
            ..base
        };
    }

    let args = build_kill_args(pid, mode, include_tree);
    match Command::new("taskkill").args(&args).output() {
        Ok(out) if out.status.success() => KillResult {
            success: true,
            message: format!(
                "taskkill {}",
                args.join(" ")
            ),
            ..base
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let hint = if mode == KillMode::Graceful {
                " Console processes often ignore a graceful request; use forced termination if you intended that."
            } else {
                ""
            };
            KillResult {
                message: format!("taskkill failed: {}.{hint}", if stderr.is_empty() { "unknown error" } else { &stderr }),
                ..base
            }
        }
        Err(e) => KillResult {
            message: format!("could not run taskkill: {e}"),
            ..base
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graceful_args() {
        assert_eq!(build_kill_args(1234, KillMode::Graceful, false), vec!["/PID", "1234"]);
    }

    #[test]
    fn force_args() {
        assert_eq!(build_kill_args(1234, KillMode::Force, false), vec!["/F", "/PID", "1234"]);
    }

    #[test]
    fn force_tree_args() {
        assert_eq!(build_kill_args(1234, KillMode::Force, true), vec!["/F", "/T", "/PID", "1234"]);
    }

    #[test]
    fn mode_parsing() {
        assert_eq!(KillMode::from_str("graceful"), Some(KillMode::Graceful));
        assert_eq!(KillMode::from_str("force"), Some(KillMode::Force));
        assert_eq!(KillMode::from_str("rm -rf"), None);
        assert_eq!(KillMode::from_str(""), None);
    }

    #[test]
    fn refuses_own_pid() {
        let result = terminate(std::process::id(), KillMode::Graceful, false);
        assert!(!result.success);
        assert!(result.message.contains("refusing"));
    }

    #[test]
    fn refuses_unknown_pid() {
        // PID 0 can never be a real process; terminate must refuse it.
        let result = terminate(0, KillMode::Force, true);
        assert!(!result.success);
        assert!(result.message.contains("does not exist") || result.message.contains("refusing"));
    }
}
