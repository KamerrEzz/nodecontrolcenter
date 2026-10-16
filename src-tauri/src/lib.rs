use tauri::Manager;

mod alerts;
mod commands;
mod detect;
mod kill;
mod model;
mod ports;
mod settings;
mod snapshot;

/// Public helpers for integration tests (`tests/live.rs`). Harmless in
/// production builds; used to validate real system behavior end-to-end.
pub mod test_support {
    pub use crate::kill::terminate;
    pub use crate::kill::KillMode as KillModeAlias;
    pub use crate::model::{Confidence, ProcessKind, Snapshot};
    pub use crate::ports::{find_tcp_listener, get_socket_entries};
    pub use crate::snapshot::build_snapshot;

    pub fn build_test_snapshot() -> Snapshot {
        build_snapshot(&Default::default())
    }

    pub fn process_kind_node() -> ProcessKind {
        ProcessKind::Node
    }

    pub fn confidence_high() -> Confidence {
        Confidence::High
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = commands::init_state(&app.handle());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_process_details,
            commands::get_port_status,
            commands::terminate_process,
            commands::open_in_explorer,
            commands::get_settings,
            commands::save_settings,
            commands::dismiss_alert,
            commands::restore_dismissed_alerts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Node Control Center");
}
