//! Live integration tests. These run only with `cargo test -- --ignored`
//! because they interact with the real operating system.
//!
//! Safety contract:
//! - Only processes that THIS test spawned are ever terminated.
//! - The spawned server is identified by both PID and port before acting.

use std::process::{Child, Command, Stdio};
use std::time::Duration;

struct TestServer {
    child: Child,
    port: u16,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        // Safety net: never leave the test server behind.
        let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &self.child.id().to_string()]).output();
    }
}

/// Spawn `node -e "..."` listening on an OS-assigned port (port 0).
fn spawn_test_server() -> TestServer {
    let child = Command::new("node")
        .arg("-e")
        .arg(r#"require("http").createServer((q,s)=>s.end("ok")).listen(0,"127.0.0.1");"#)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("node must be available to run live tests");
    // Port 0 picked a random port; discover it via netstat by PID.
    let pid = child.id();
    let port = wait_for_listener_port(pid).expect("test server should open a listening port within 10s");
    TestServer { child, port }
}

/// Find the TCP LISTEN port owned by `pid`, retrying briefly.
fn wait_for_listener_port(pid: u32) -> Option<u16> {
    for _ in 0..50 {
        if let Ok(entries) = tauri_app_lib::test_support::get_socket_entries() {
            for e in &entries {
                if e.protocol == "tcp" && e.state == "listen" && e.pids.contains(&pid) {
                    return Some(e.port);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    None
}

#[test]
#[ignore]
fn live_snapshot_detects_spawned_node_server() {
    let server = spawn_test_server();
    let snapshot = tauri_app_lib::test_support::build_test_snapshot();

    // 1) The process is detected and classified as Node, high confidence.
    let p = snapshot
        .processes
        .iter()
        .find(|p| p.pid == server.child.id())
        .unwrap_or_else(|| panic!("spawned node server (pid {}) missing from snapshot", server.child.id()));
    assert_eq!(p.kind, tauri_app_lib::test_support::process_kind_node());
    assert_eq!(p.confidence, tauri_app_lib::test_support::confidence_high());
    assert!(p.is_listening, "server should be flagged as listening");

    // 2) PID -> port relationship is present in both directions.
    assert!(p.ports.contains(&server.port), "process must list port {}", server.port);
    let entry = tauri_app_lib::test_support::find_tcp_listener(&snapshot.sockets, server.port)
        .unwrap_or_else(|| panic!("port {} missing from socket snapshot", server.port));
    assert!(entry.pids.contains(&server.child.id()));
    assert!(entry.node_related, "owner must be flagged Node-related");

    // 3) A vanished PID must not appear anywhere in the snapshot.
    let fake_pid = 4_000_000;
    assert!(snapshot.processes.iter().all(|p| p.pid != fake_pid));
    assert!(snapshot.sockets.iter().all(|e| !e.pids.contains(&fake_pid)));
}

use tauri_app_lib::test_support::terminate;
use tauri_app_lib::test_support::KillModeAlias;

#[test]
#[ignore]
fn live_terminate_only_the_spawned_server() {
    let mut server = spawn_test_server();
    let pid = server.child.id();
    let port = server.port;

    // Graceful first: the least aggressive mechanism.
    let result = terminate(pid, KillModeAlias::Graceful, false);
    if !result.success {
        // Console processes usually ignore graceful termination; force is the
        // documented fallback and is still limited to our own test process.
        let forced = terminate(pid, KillModeAlias::Force, false);
        assert!(forced.success, "forced termination of our own test server failed: {}", forced.message);
    }

    // Wait until the child is really gone.
    let mut gone = false;
    for _ in 0..25 {
        if let Ok(Some(_status)) = server.child.try_wait() {
            gone = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    assert!(gone, "test server process should have exited");

    // And the port must be released (fresh snapshot, not a stale one).
    std::thread::sleep(Duration::from_millis(500));
    let snapshot = tauri_app_lib::test_support::build_test_snapshot();
    let still_listening = tauri_app_lib::test_support::find_tcp_listener(&snapshot.sockets, port);
    assert!(
        still_listening.is_none() || !still_listening.unwrap().pids.contains(&pid),
        "port {port} must no longer be owned by the terminated test server",
    );

    // Prevent Drop from killing an already-dead pid (harmless, but be tidy).
    let _ = server.child.wait();
    std::mem::forget(server);
}
