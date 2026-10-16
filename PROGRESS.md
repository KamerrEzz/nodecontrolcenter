# Project Progress Log

Last updated: build/installer stage in progress.

## Completed stages

### Stage A — Environment inspection ✅
- Windows 11 Pro 64-bit (build 26200), Smart App Control ACTIVE (important: blocks unsigned npm native binaries).
- Visual Studio 18 Community + MSVC + Windows SDK 10.0.26100: present.
- Node 26.2.0 / npm 11.13.0 / pnpm 12.4.2 / git: present.
- Rust: rustup was installed but the stable-msvc toolchain was CORRUPT (rustc.exe + rustlib missing). Reinstalled stable 1.99.1 with minimal profile. Works.
- Working directory was empty → safe to scaffold.

### Stage B — Preparation ✅
- Scaffolded with create-tauri-app (react-ts template, pnpm, identifier dev.nodecontrol.center).
- Added: lucide-react (frontend), sysinfo 0.39 + netstat2 0.11 (Rust).
- All APIs verified against the actual vendored crate sources before writing code.

### Stage C — Implementation ✅
- Backend modules: model, detect (classification/inference), ports (native socket tables),
  snapshot (sysinfo + joins), alerts (5 evidence-based rules), kill (validated taskkill), settings (JSON persistence), commands (validated Tauri surface).
- Frontend: full design system (dark carbon/violet, light theme), 5 functional views
  (Overview, Node Processes, Ports, Alerts, Settings), contextual details panel,
  PID-confirmation kill dialog, status bar, live error/loading/empty states.
- tauri.conf.json: proper CSP, window sizing, product name.

### Stage D — Tests ✅
- Rust: 32/32 unit tests pass (classification, port→pid join, alert rules, kill args, settings sanitize, dismissal logic).
- Fixed real bug found by tests: TCP state string casing mismatch ("Listen" vs "listen") that would have broken the Ports view.
- Frontend: 22/22 vitest pass; tsc --noEmit clean; vite production build OK.
- Live integration tests (tests/live.rs, #[ignored] by default): PASSED —
  spawned a real Node HTTP server, snapshot detected it (kind=node, confidence=high,
  port↔pid join verified both ways), terminated only it (graceful first), port released.

### Stage E — Real validation ✅ (backend level)
- Live tests validate against real OS data end-to-end. No leftover test processes.

### Stage F — Installer ⏳ IN PROGRESS
- Blocker 1: `pnpm tauri build` fails — Windows Smart App Control blocks the
  @tauri-apps/cli native binding downloaded by npm (cli.win32-x64-msvc.node).
- Blocker 2: `cargo install tauri-cli` fails — SAC blocks build-script exes (os error 4551), both in %TEMP% and project-local cargo-install dirs.
### Stage F — Installer ✅ COMPLETE
- Portable exe: src-tauri/target/release/tauri-app.exe (4.3 MB, LTO). Launched and running.
- Installers generated 2026-10-15 17:24:
  - MSI:   src-tauri/target/release/bundle/msi/Node Control Center_0.1.0_x64_en-US.msi (2.21 MB)
  - NSIS:  src-tauri/target/release/bundle/nsis/Node Control Center_0.1.0_x64-setup.exe (1.47 MB)
- .tmpbuild/tauri-cli-bin/cargo-tauri.exe kept for future builds (SAC blocks npm CLI and cargo install).

## Project status: v0.1.1 — i18n (EN/ES) added
- Language setting (English / Español) in Settings, persisted in backend settings.json.
- Full UI translation via src/i18n.ts (type-checked dictionaries; test enforces EN/ES key parity).
- Tests: 33/33 Rust unit (incl. language sanitize), 25/25 vitest, tsc clean.

## Known limitations (documented in UI)
- CWD of other processes unreadable on Windows → project dir inferred from
  command line / INIT_CWD env, always labeled "inferred".
- Graceful taskkill often fails for console node processes → dialog offers documented forced fallback.
