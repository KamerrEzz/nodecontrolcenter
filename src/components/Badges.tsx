import { AlertTriangle, CheckCircle2, HelpCircle, Info, ShieldAlert } from "lucide-react";
import type { AlertKind, Confidence, ProcessKind, Severity } from "../types";

export function StatusBadge({ listening, status }: { listening: boolean; status: string }) {
  if (listening) {
    return (
      <span className="badge green">
        <span className="dot" /> Listening
      </span>
    );
  }
  // Backend status strings are data; map the common one for readability.
  const label = status === "run" ? "Running" : status;
  return (
    <span className="badge gray">
      <span className="dot" /> {label}
    </span>
  );
}

const KIND_LABEL: Record<ProcessKind, string> = {
  node: "Node",
  launcher: "Launcher",
  related: "Related",
};

export function KindBadge({ kind, role }: { kind: ProcessKind; role: string }) {
  const cls = kind === "node" ? "violet" : kind === "launcher" ? "blue" : "gray";
  return (
    <span className={`badge ${cls}`}>
      {KIND_LABEL[kind]}
      {role && role !== "runtime" ? ` · ${role}` : ""}
    </span>
  );
}

export function ConfidenceTag({ level }: { level: Confidence }) {
  return <span className={`confidence ${level}`}>{level}</span>;
}

const ALERT_ICONS: Record<AlertKind, typeof Info> = {
  duplicate_servers: Copy1,
  foreign_port_owner: ShieldAlert,
  long_running: Clock1,
  orphan_candidate: HelpCircle,
  unidentified_owner: HelpCircle,
};

// Small local aliases to keep imports tidy.
import { Copy as Copy1, Clock as Clock1 } from "lucide-react";

export function AlertIcon({ kind, severity }: { kind: AlertKind; severity: Severity }) {
  const Icon = ALERT_ICONS[kind] ?? (severity === "warning" ? AlertTriangle : Info);
  return <Icon size={16} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Info;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={34} strokeWidth={1.6} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function SuccessDot() {
  return <CheckCircle2 size={13} style={{ color: "var(--green)" }} />;
}
