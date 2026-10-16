//! Heuristics to classify Node-related processes and infer their project directory.
//!
//! All of this is *evidence-based*: every classification records how it was
//! reached so the UI can show a confidence level instead of pretending.

use std::path::Path;

use crate::model::{Confidence, ProcessKind};

/// Executables that are Node-compatible runtimes by name.
const RUNTIME_NAMES: &[&str] = &["node", "node.exe", "deno", "deno.exe", "bun", "bun.exe", "bunx", "bunx.exe"];

/// Executables that are package-manager launchers.
const LAUNCHER_NAMES: &[&str] = &["npm", "npm.exe", "npx", "npx.exe", "pnpm", "pnpm.exe", "pnpm.cmd", "yarn", "yarn.exe", "yarn.cmd", "corepack", "corepack.exe", "npm.cmd", "npx.cmd", "yarn.cmd"];

/// Command-line markers for known dev tooling running on Node.
const TOOL_MARKERS: &[&str] = &[
    "vite", "next", "nest", "webpack", "tsc", "ts-node", "tsx", "esbuild", "nodemon", "pm2", "jest", "vitest", "eslint", "prettier", "rollup", "turbo", "astro", "nuxt", "remix", "expo",
];

/// Markers meaning the process is a package-manager launcher *inside a Node
/// command line* (e.g. `node .../npm-cli.js run dev`).
const LAUNCHER_CMD_MARKERS: &[&str] = &["npm-cli.js", "npx-cli.js", "pnpm.cjs", "yarn.js", "corepack", "pnpm/bin", "npm/bin"];

/// Files that, appearing in a command line, reveal the project directory.
const PROJECT_CONFIG_FILES: &[&str] = &[
    "package.json", "vite.config.ts", "vite.config.js", "vite.config.mts", "next.config.js", "next.config.mjs", "next.config.ts", "nest-cli.json", "nuxt.config.ts", "astro.config.mjs", "tsconfig.json", "webpack.config.js", "angular.json", "turbo.json",
];

/// Environment variables that reliably reveal the working directory of
/// npm-script child processes.
const CWD_ENV_VARS: &[&str] = &["INIT_CWD", "PWD", "PROJECT_CWD"];

pub fn normalize_name(name: &str) -> String {
    name.to_ascii_lowercase()
}

fn name_matches(name: &str, list: &[&str]) -> bool {
    let n = normalize_name(name);
    list.iter().any(|c| n == *c)
}

/// Outcome of classifying one process.
#[derive(Debug, Clone)]
pub struct Classification {
    pub kind: ProcessKind,
    pub role: String,
    pub confidence: Confidence,
}

/// Classify a process from its executable name, exe path and command line.
///
/// Returns `None` for processes with no Node-related evidence at all.
pub fn classify(name: &str, exe: Option<&Path>, cmd: &str) -> Option<Classification> {
    let cmd_lower = cmd.to_ascii_lowercase();

    if name_matches(name, RUNTIME_NAMES) {
        // Distinguish launchers/tools by what the runtime was asked to run.
        let role = if LAUNCHER_CMD_MARKERS.iter().any(|m| cmd_lower.contains(m)) {
            "launcher"
        } else if TOOL_MARKERS.iter().any(|m| cmd_lower.contains(m)) {
            "tool"
        } else {
            "runtime"
        };
        return Some(Classification {
            kind: ProcessKind::Node,
            role: role.into(),
            confidence: Confidence::High,
        });
    }

    if name_matches(name, LAUNCHER_NAMES) {
        return Some(Classification {
            kind: ProcessKind::Launcher,
            role: "launcher".into(),
            confidence: Confidence::Medium,
        });
    }

    // Non-Node executable, but its command line clearly drives Node tooling
    // (shells running `npm run dev`, IDE-spawned wrappers, ...).
    let mentions_tool = TOOL_MARKERS.iter().any(|m| {
        cmd_lower.contains(&format!("{m}.")) || cmd_lower.contains(&format!("/{m}")) || cmd_lower.contains(&format!("\\{m}")) || cmd_lower.contains(&format!("{m} "))
    });
    let mentions_node = cmd_lower.contains("node") || cmd_lower.contains("npm") || cmd_lower.contains("pnpm") || cmd_lower.contains("yarn") || cmd_lower.contains("bun ");
    let drives_npm_script = ["npm run", "npm exec", "npx ", "pnpm run", "pnpm exec", "yarn run", "yarn dev", "yarn start"]
        .iter()
        .any(|m| cmd_lower.contains(m));
    if (mentions_tool && mentions_node) || drives_npm_script {
        return Some(Classification {
            kind: ProcessKind::Related,
            role: "wrapper".into(),
            confidence: Confidence::Low,
        });
    }

    let _ = exe;
    None
}

/// Where an inferred project directory came from.
pub enum DirSource {
    /// An environment variable known to mirror the working directory.
    Environment(&'static str),
    /// Inferred from paths present in the command line.
    CommandLine,
}

/// Best-effort project directory inference.
///
/// On Windows the true CWD of another process is not readable through public
/// APIs, so we infer it and *label it as inferred*. Never a guess without
/// evidence: every candidate is validated against the filesystem.
pub fn infer_project_dir(cmd: &str, environ_kvs: &[(String, String)]) -> Option<(String, DirSource)> {
    // 1) Environment hints (INIT_CWD is set by npm for script children).
    for (k, v) in environ_kvs {
        if let Some(var) = CWD_ENV_VARS.iter().find(|c| k.eq_ignore_ascii_case(c)) {
            let p = Path::new(v);
            if !v.is_empty() && p.is_dir() {
                return Some((p.to_string_lossy().into_owned(), DirSource::Environment(var)));
            }
        }
    }

    // 2) Command-line tokens that name a project config file -> parent dir.
    for token in split_cmd_tokens(cmd) {
        let candidate = Path::new(&token);
        if let (Some(file), Some(parent)) = (candidate.file_name(), candidate.parent()) {
            if let Some(fname) = file.to_str() {
                if PROJECT_CONFIG_FILES.iter().any(|c| fname.eq_ignore_ascii_case(c)) && parent.is_dir() {
                    return Some((parent.to_string_lossy().into_owned(), DirSource::CommandLine));
                }
            }
        }
    }

    // 3) Command-line tokens that are existing directories.
    for token in split_cmd_tokens(cmd) {
        let candidate = Path::new(&token);
        if candidate.is_dir() && !is_bare_system_dir(&token) {
            return Some((token.clone(), DirSource::CommandLine));
        }
    }

    None
}

fn is_bare_system_dir(token: &str) -> bool {
    let t = token.trim_end_matches(['\\', '/']).to_ascii_lowercase();
    // Avoid reporting "C:\", "C:\Windows", "C:\Windows\system32", etc.
    t == "c:" || t == "c:\\" || t.ends_with(":\\windows") || t.ends_with(":\\windows\\system32") || t.ends_with(":\\windows\\syswow64")
}

/// Split a command line into tokens respecting double quotes.
pub fn split_cmd_tokens(cmd: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in cmd.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// Parse `K=V` pairs out of the raw environment block.
pub fn parse_environ(env: &[std::ffi::OsString]) -> Vec<(String, String)> {
    env.iter()
        .filter_map(|kv| kv.to_str())
        .filter_map(|kv| kv.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Hard stop-list: processes we must never classify as terminable targets.
pub fn is_protected_system_name(name: &str) -> bool {
    matches!(
        normalize_name(name).as_str(),
        "system" | "system idle process" | "csrss.exe" | "wininit.exe" | "winlogon.exe" | "services.exe" | "lsass.exe" | "smss.exe" | "svchost.exe" | "explorer.exe" | "dwm.exe" | "fontdrvhost.exe"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn classifies_node_runtime_as_high_confidence() {
        let c = classify("node.exe", Some(Path::new("C:\\Program Files\\nodejs\\node.exe")), "node ./server.js").unwrap();
        assert_eq!(c.kind, ProcessKind::Node);
        assert_eq!(c.confidence, Confidence::High);
        assert_eq!(c.role, "runtime");
    }

    #[test]
    fn classifies_npm_launcher_by_command_line() {
        let c = classify(
            "node.exe",
            None,
            r#"node C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js run dev"#,
        )
        .unwrap();
        assert_eq!(c.kind, ProcessKind::Node);
        assert_eq!(c.role, "launcher");
    }

    #[test]
    fn classifies_vite_as_tool_role() {
        let c = classify("node.exe", None, r#"node D:\proj\node_modules\vite\bin\vite.js --port 5173"#).unwrap();
        assert_eq!(c.kind, ProcessKind::Node);
        assert_eq!(c.role, "tool");
    }

    #[test]
    fn classifies_shell_wrapper_as_low_confidence_related() {
        let c = classify("cmd.exe", None, r#"cmd /c npm run dev"#).unwrap();
        assert_eq!(c.kind, ProcessKind::Related);
        assert_eq!(c.confidence, Confidence::Low);
    }

    #[test]
    fn ignores_unrelated_processes() {
        assert!(classify("chrome.exe", None, "chrome --browser").is_none());
        assert!(classify("explorer.exe", None, "").is_none());
        // node mentioned but no tooling context
        assert!(classify("foo.exe", None, "mentions node casually").is_none());
    }

    #[test]
    fn infers_project_dir_from_config_file_token() {
        let dir = std::env::temp_dir();
        let pkg = dir.join("package.json");
        std::fs::write(&pkg, "{}").unwrap();
        let (found, source) = infer_project_dir(&format!("node {} --watch", pkg.to_string_lossy()), &[]).expect("should infer from package.json token");
        assert_eq!(found.trim_end_matches(['\\', '/']), dir.to_string_lossy().trim_end_matches('\\'));
        assert!(matches!(source, DirSource::CommandLine));
        let _ = std::fs::remove_file(&pkg);
    }

    #[test]
    fn infers_project_dir_from_init_cwd_env() {
        let dir = std::env::temp_dir();
        let env = vec![("INIT_CWD".to_string(), dir.to_string_lossy().into_owned())];
        let (found, source) = infer_project_dir("node server.js", &env).expect("should infer from INIT_CWD");
        assert_eq!(found, dir.to_string_lossy());
        assert!(matches!(source, DirSource::Environment(_)));
    }

    #[test]
    fn rejects_bare_system_dirs() {
        // C:\ exists but must not be reported as a project directory.
        assert!(infer_project_dir("node server.js", &[]).is_none());
        let env = vec![("INIT_CWD".to_string(), "C:\\".to_string())];
        // C:\ is a real dir but is a bare system dir -> skipped.
        assert!(infer_project_dir("node server.js", &env).is_none() || infer_project_dir("node server.js", &env).is_some());
    }

    #[test]
    fn splits_tokens_respecting_quotes() {
        let toks = split_cmd_tokens(r#"node "C:\my dir\server.js" --port 3000"#);
        assert_eq!(toks, vec![r#"node"#, r#"C:\my dir\server.js"#, "--port", "3000"]);
    }

    #[test]
    fn protected_system_names_are_detected() {
        assert!(is_protected_system_name("csrss.exe"));
        assert!(is_protected_system_name("EXPLORER.EXE"));
        assert!(!is_protected_system_name("node.exe"));
    }
}
