<div align="center">

# Node Control Center

**See what your Node.js processes are really doing — locally, beautifully, safely.**

A premium desktop app for Windows to monitor Node.js processes, dev servers and local ports.
Built with Tauri 2, Rust, React and TypeScript. No accounts, no telemetry, no cloud.

[![Tauri 2](https://img.shields.io/badge/Tauri-2-8b5cf6?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?logo=windows11&logoColor=white)](#platform-notes)

[English](#features) · [Español](README.es.md)

</div>

---

## Why

If you work with dev servers, AI coding tools and multiple projects, you know the feeling:
*something* is listening on port 3000, but you don't know what. Task Manager shows a dozen
`node.exe` entries with no context. Node Control Center answers the questions you actually ask:

- What Node processes are running, and which project do they belong to?
- **What is occupying port 3000 / 5173 / 8080…?**
- Are there duplicate servers running for the same project?
- Which process can I safely terminate — and which ones must I not touch?

## Screenshots

| Overview | Ports |
|---|---|
| ![Overview](docs/screenshots/overview.png) | ![Ports](docs/screenshots/ports.png) |

| Node Processes | Settings |
|---|---|
| ![Processes](docs/screenshots/processes.png) | ![Settings](docs/screenshots/settings.png) |

## Features

- **Overview** — one glance: running Node processes, TCP listeners, duplicated projects and
  warnings. Every card is a shortcut into the relevant view.
- **Node Processes** — every Node-related process (node, npm, npx, pnpm, yarn, bun, vite, next,
  nest, tsx, PM2…) with PID/PPID, command line, project directory, uptime, CPU/memory and
  parent/child relations. Each process carries an explicit **confidence level** — the app never
  pretends to know more than it does.
- **Ports** — every TCP and UDP socket straight from the OS tables, with owner PIDs. Includes
  the *"what is occupying this port?"* lookup, favorite dev ports, and honest states:
  **occupied / free / unknown** — it never calls a port "free" from an untrusted query.
- **Alerts** — explainable, evidence-based rules: duplicate servers per project, a favorite port
  held by a non-Node process, long-running servers, launchers whose parent vanished, and port
  owners the system cannot identify. Every alert states **facts + confidence**, never verdicts.
- **Details panel** — identity, process tree, copyable command line, project directory
  (openable in Explorer), ports and metrics for the selected process.
- **Safe termination** — graceful first, forced as a documented fallback, optional child tree.
  Termination requires **typing the PID to confirm**, and the backend re-validates the target
  against live system data before acting. Protected system processes are always refused.
- **English & Spanish UI** — full interface translation, auto-detected on first run.
- **Dark & light themes**, configurable auto-refresh (2–30 s), favorite ports, thresholds.
  Everything stored locally.

## Installation

### Download

Grab the latest installer from the [Releases](https://github.com/kamerrezz/nodecontrolcenter/releases) page:

| File | Type |
|---|---|
| `Node_Control_Center_x.y.z_x64_en-US.msi` | MSI installer (recommended) |
| `Node_Control_Center_x.y.z_x64-setup.exe` | NSIS setup wizard |

Both are under 3 MB. Smart App Control / SmartScreen may ask for confirmation on first run
(the binaries are not code-signed).

### Build from source

Prerequisites: [Rust](https://rustup.rs) (stable, MSVC), Node.js ≥ 20, pnpm.

```bash
pnpm install
pnpm tauri dev      # run with hot reload
pnpm tauri build    # produce installers in src-tauri/target/release/bundle
```

## How it reads your system

| Data | Source |
|---|---|
| Processes (name, exe, cmd, PPID, times, CPU, memory) | OS process APIs via [`sysinfo`](https://crates.io/crates/sysinfo) |
| Sockets (TCP/UDP, states, owner PIDs) | `GetExtendedTcpTable` / `GetExtendedUdpTable` via [`netstat2`](https://crates.io/crates/netstat2) — **never** parsed `netstat` output |
| Project directory | **Inferred** from the command line and npm environment (`INIT_CWD`) — the working directory of another process is not readable on Windows, and the UI always says so |

The webview has **no shell access**. The only surface exposed to the UI is a set of validated
Tauri commands; destructive operations re-check the target against a fresh snapshot and refuse
anything that is not a live, Node-related process.

## Privacy

- All monitoring is local. Nothing leaves your machine.
- No telemetry, analytics, ads, auto-updaters or accounts.
- Settings live in a plain JSON file in your user config directory.
- No shell command history or sensitive data is persisted.

## Testing

```bash
cd src-tauri
cargo test                        # unit tests (no OS side effects)
cargo test --test live -- --ignored  # live tests: spawn a real Node server,
                                     # detect it, terminate it, verify port release

# from the repo root
pnpm exec vitest run              # frontend unit tests
pnpm exec tsc --noEmit            # type check
```

The live tests only ever touch processes that the test itself spawned.

## Project structure

```
src-tauri/src/
  model.rs      types shared with the frontend (serde)
  detect.rs     Node-classification heuristics + project-dir inference
  ports.rs      TCP/UDP snapshots from the OS tables
  snapshot.rs   process enumeration + joins + stats
  alerts.rs     evidence-based alert rules
  kill.rs       validated taskkill wrapper with guard rails
  settings.rs   JSON persistence
  commands.rs   the only surface exposed to the webview

src/
  api.ts        typed invoke wrappers
  i18n.ts       EN/ES dictionaries (type-checked, parity-tested)
  views/        Overview · Node Processes · Ports · Alerts · Settings
  components/   DetailsPanel · KillDialog · ProcessTable
```

## Platform notes

- **Windows 10/11 x64** is the supported platform today. The Rust backend is organized so
  Linux/macOS ports of the detection layer are straightforward (`sysinfo` and `netstat2` are
  cross-platform already).
- Dark and light themes included; the UI falls back gracefully to system fonts when Inter is
  not installed.

## License

[MIT](LICENSE)
