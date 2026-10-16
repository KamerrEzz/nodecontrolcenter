// Pure formatting helpers (unit-tested).

export function formatUptime(secs: number | null | undefined, na = "N/A"): string {
  if (secs == null || secs < 0) return na;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${Math.round(secs % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatMemory(mb: number | null | undefined, na = "N/A"): string {
  if (mb == null || mb < 0) return na;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatCpu(pct: number | null | undefined, na = "N/A"): string {
  if (pct == null || pct < 0) return na;
  return `${pct.toFixed(1)}%`;
}

export function formatTime(unixSecs: number | null | undefined, locale = "en-US"): string {
  if (!unixSecs) return "N/A";
  return new Date(unixSecs * 1000).toLocaleTimeString(locale);
}

export function formatDateTime(unixSecs: number | null | undefined, locale = "en-US", na = "N/A"): string {
  if (!unixSecs) return na;
  return new Date(unixSecs * 1000).toLocaleString(locale);
}

export function truncateCmd(cmd: string, max = 96): string {
  if (cmd.length <= max) return cmd;
  return `${cmd.slice(0, max - 1)}…`;
}

export function shortPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  return `…${path.slice(-(max - 1))}`;
}
