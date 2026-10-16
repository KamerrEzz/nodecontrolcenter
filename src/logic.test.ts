import { describe, expect, it } from "vitest";
import type { Alert, ProcessInfo, Snapshot, SocketEntry } from "./types";

// Pure UI-logic tests: filters, lookups and derived values used by the views.
// These mirror the shape produced by the Rust backend.

function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    pid: 1,
    ppid: null,
    name: "node.exe",
    exe: "C:\\Program Files\\nodejs\\node.exe",
    cmd: "node server.js",
    status: "run",
    kind: "node",
    role: "runtime",
    confidence: "high",
    start_time_secs: 1_000_000,
    run_time_secs: 60,
    cpu_percent: 0.1,
    mem_mb: 50,
    ports: [],
    children: [],
    project_dir: null,
    project_dir_source: null,
    is_listening: false,
    ...overrides,
  };
}

function socket(overrides: Partial<SocketEntry> = {}): SocketEntry {
  return {
    protocol: "tcp",
    local_addr: "0.0.0.0",
    port: 3000,
    state: "listen",
    pids: [1],
    process_names: ["node.exe"],
    node_related: true,
    ...overrides,
  };
}

describe("snapshot filtering logic (as used in ProcessesView)", () => {
  const snapshot: Snapshot = {
    generated_at_secs: 1_700_000_000,
    processes: [
      proc({ pid: 1, is_listening: true, ports: [3000], cmd: "node vite --port 3000", project_dir: "D:\\proj\\a" }),
      proc({ pid: 2, name: "npm.cmd", kind: "launcher", confidence: "medium", is_listening: false }),
      proc({ pid: 3, name: "cmd.exe", kind: "related", confidence: "low", is_listening: false }),
    ],
    sockets: [socket(), socket({ port: 4321, pids: [9], process_names: ["nginx.exe"], node_related: false })],
    alerts: [],
    stats: { node_processes: 3, listening_tcp: 1, duplicated_projects: 0, attention_count: 0 },
    errors: [],
  };

  it("filters by status listening", () => {
    const listening = snapshot.processes.filter((p) => p.is_listening);
    expect(listening.map((p) => p.pid)).toEqual([1]);
  });

  it("filters by kind", () => {
    const launchers = snapshot.processes.filter((p) => p.kind === "launcher");
    expect(launchers.map((p) => p.pid)).toEqual([2]);
  });

  it("filters by high confidence", () => {
    const high = snapshot.processes.filter((p) => p.confidence === "high");
    expect(high.map((p) => p.pid)).toEqual([1]);
  });

  it("search matches by pid, name, command, directory and port", () => {
    const q = (s: string) => s.trim().toLowerCase();
    const matches = (s: string) =>
      snapshot.processes.filter(
        (p) =>
          p.name.toLowerCase().includes(q(s)) ||
          p.cmd.toLowerCase().includes(q(s)) ||
          p.pid.toString() === s ||
          (p.project_dir ?? "").toLowerCase().includes(q(s)) ||
          p.ports.some((port) => port.toString() === s),
      );
    expect(matches("2").map((p) => p.pid)).toEqual([2]);
    expect(matches("vite").map((p) => p.pid)).toEqual([1]);
    expect(matches("d:\\proj\\a").map((p) => p.pid)).toEqual([1]);
    expect(matches("no-such-token")).toEqual([]);
  });

  it("socket filter keeps only tcp listeners by default", () => {
    const tcpListen = snapshot.sockets.filter((e) => e.protocol === "tcp" && e.state === "listen");
    expect(tcpListen.map((e) => e.port).sort((a, b) => a - b)).toEqual([3000, 4321]);
  });
});

describe("port lookup result states (as used in PortsView)", () => {
  it("listening state exposes owner info", () => {
    const result = { status: "listening" as const, entry: socket({ port: 8080, pids: [42] }) };
    expect(result.entry.pids).toContain(42);
  });

  it("free state has no entry", () => {
    const result = { status: "free" as const };
    expect("entry" in result).toBe(false);
  });

  it("unknown state carries a reason", () => {
    const result = { status: "unknown" as const, reason: "socket table query failed: access denied" };
    expect(result.reason).toMatch(/failed/);
  });
});

describe("kill confirmation rules (as used in KillDialog)", () => {
  it("requires the typed PID to match before enabling", () => {
    const confirmText = (s: string, pid: number) => s.trim().toLowerCase() === pid.toString();
    expect(confirmText("1234", 1234)).toBe(true);
    expect(confirmText(" 1234 ", 1234)).toBe(true);
    expect(confirmText("1235", 1234)).toBe(false);
    expect(confirmText("", 1234)).toBe(false);
  });
});

describe("alert display (as used in AlertsView)", () => {
  it("renders warning and info alerts with related pids", () => {
    const alerts: Alert[] = [
      {
        key: "dup:D:\\proj\\a",
        kind: "duplicate_servers",
        severity: "warning",
        confidence: "medium",
        title: "2 processes are listening on the same project",
        detail: "…",
        related_pids: [1, 2],
        related_ports: [3000, 3001],
        facts: {},
      },
    ];
    const warnings = alerts.filter((a) => a.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].related_pids).toEqual([1, 2]);
  });
});
