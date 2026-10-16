import { describe, expect, it } from "vitest";
import { localizeAlert } from "./localizeAlert";
import { dictFor } from "./i18n";
import type { Alert } from "./types";

const en = dictFor("en");
const es = dictFor("es");
const tr = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

function alert(overrides: Partial<Alert>): Alert {
  return {
    key: "test",
    kind: "duplicate_servers",
    severity: "warning",
    confidence: "medium",
    title: "backend fallback",
    detail: "backend fallback detail",
    related_pids: [1, 2],
    related_ports: [],
    facts: {},
    ...overrides,
  };
}

describe("localizeAlert", () => {
  it("renders duplicate servers in Spanish from facts", () => {
    const a = alert({
      kind: "duplicate_servers",
      facts: { project_dir: "D:\\proj\\a", count: 2, ports: "3000, 3001" },
    });
    const la = localizeAlert(a, es, tr);
    expect(la.title).toBe("2 servidores están escuchando en el mismo proyecto");
    expect(la.detail).toContain("D:\\proj\\a");
    expect(la.detail).toContain("3000, 3001");
  });

  it("renders foreign port owner in English", () => {
    const a = alert({
      kind: "foreign_port_owner",
      related_ports: [5173],
      facts: { port: 5173, pids: [99], names: ["nginx.exe"] },
    });
    const la = localizeAlert(a, en, tr);
    expect(la.title).toBe("Port 5173 is held by a process that is not Node");
    expect(la.detail).toContain("99");
    expect(la.detail).toContain("nginx.exe");
  });

  it("renders long running with formatted duration", () => {
    const a = alert({ kind: "long_running", facts: { pid: 7, name: "node.exe", run_time_secs: 25 * 3600 } });
    const la = localizeAlert(a, es, tr);
    expect(la.title).toContain("PID 7");
    expect(la.title).toMatch(/25h/);
  });

  it("falls back to backend text when facts are missing", () => {
    const a = alert({ title: "backend title", detail: "backend detail" });
    const la = localizeAlert(a, es, tr);
    expect(la.title).toBe("backend title");
    expect(la.detail).toBe("backend detail");
  });

  it("every kind renders in both languages without crashing", () => {
    const cases: Alert[] = [
      alert({ kind: "duplicate_servers", facts: { project_dir: "D:\\x", count: 2, ports: "3000" } }),
      alert({ kind: "foreign_port_owner", facts: { port: 80, pids: [1], names: ["x"] } }),
      alert({ kind: "long_running", facts: { pid: 1, name: "node", run_time_secs: 7200 } }),
      alert({ kind: "orphan_candidate", facts: { pid: 3, name: "node", parent_pid: 2 } }),
      alert({ kind: "unidentified_owner", facts: { port: 9999, local_addr: "0.0.0.0" } }),
    ];
    for (const dict of [en, es]) {
      for (const a of cases) {
        const la = localizeAlert(a, dict, tr);
        expect(la.title.length).toBeGreaterThan(0);
        expect(la.detail.length).toBeGreaterThan(0);
      }
    }
  });
});
