//! Tauri commands: the entire attack surface exposed to the webview.
//! Every input is validated; the frontend can never run arbitrary commands.

use std::path::PathBuf;

use tauri::Manager;

use crate::kill::{self, KillMode};
use crate::model::{AppSettings, KillResult, PortStatus, ProcessDetails, Snapshot};
use crate::{ports, settings, snapshot};

#[tauri::command]
pub fn get_snapshot(state: tauri::State<SettingsState>) -> Result<Snapshot, String> {
    let mut snap = snapshot::build_snapshot(&state.0.lock().unwrap().settings);
    // Dismissed alerts are filtered out before reaching the UI.
    let dismissed = state.0.lock().unwrap().settings.dismissed_alert_keys.clone();
    snap.alerts = crate::alerts::apply_dismissals(snap.alerts.clone(), &crate::model::AppSettings {
        dismissed_alert_keys: dismissed,
        ..Default::default()
    });
    Ok(snap)
}

#[tauri::command]
pub fn get_process_details(pid: u32) -> Result<ProcessDetails, String> {
    if pid == 0 {
        return Err("invalid PID".into());
    }
    let info = snapshot::process_details(pid)?;
    Ok(ProcessDetails {
        process: info.process,
        parent: info.parent,
        children: info.children,
        port_entries: info.port_entries,
    })
}

#[tauri::command]
pub fn get_port_status(port: u16) -> Result<PortStatus, String> {
    match ports::get_socket_entries() {
        Ok(entries) => Ok(match ports::find_tcp_listener(&entries, port) {
            Some(entry) => PortStatus::Listening { entry },
            None => PortStatus::Free,
        }),
        Err(reason) => Ok(PortStatus::Unknown { reason }),
    }
}

#[tauri::command]
pub fn terminate_process(pid: u32, mode: String, include_tree: bool) -> Result<KillResult, String> {
    if pid == 0 {
        return Err("invalid PID".into());
    }
    let kill_mode = KillMode::from_str(&mode).ok_or_else(|| format!("unknown termination mode '{mode}'"))?;
    Ok(kill::terminate(pid, kill_mode, include_tree))
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("'{path}' is not a valid directory (it may have been moved or deleted)"));
    }
    std::process::Command::new("explorer")
        .arg(&p)
        .spawn()
        .map_err(|e| format!("could not open explorer: {e}"))?;
    Ok(())
}

pub struct SettingsState(pub std::sync::Mutex<SettingsInner>);

pub struct SettingsInner {
    pub settings: AppSettings,
    pub config_dir: PathBuf,
}

#[tauri::command]
pub fn get_settings(state: tauri::State<SettingsState>) -> AppSettings {
    state.0.lock().unwrap().settings.clone()
}

#[tauri::command]
pub fn save_settings(state: tauri::State<SettingsState>, settings: AppSettings) -> Result<AppSettings, String> {
    let mut guard = state.0.lock().unwrap();
    guard.settings = settings;
    settings::sanitize(&mut guard.settings);
    settings::save(&guard.config_dir, &guard.settings)?;
    Ok(guard.settings.clone())
}

#[tauri::command]
pub fn dismiss_alert(state: tauri::State<SettingsState>, key: String) -> Result<(), String> {
    if key.is_empty() {
        return Err("empty alert key".into());
    }
    let mut guard = state.0.lock().unwrap();
    if !guard.settings.dismissed_alert_keys.contains(&key) {
        guard.settings.dismissed_alert_keys.push(key);
        settings::save(&guard.config_dir, &guard.settings)?;
    }
    Ok(())
}

#[tauri::command]
pub fn restore_dismissed_alerts(state: tauri::State<SettingsState>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    guard.settings.dismissed_alert_keys.clear();
    settings::save(&guard.config_dir, &guard.settings)
}

pub fn init_state(app: &tauri::AppHandle) -> SettingsState {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let settings = settings::load(&config_dir);
    SettingsState(std::sync::Mutex::new(SettingsInner { settings, config_dir }))
}
