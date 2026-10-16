// Minimal toast bus: components fire feedback events, the host renders them.

export type ToastKind = "ok" | "error";
type ToastFn = (message: string, kind?: ToastKind) => void;

let listener: ToastFn | null = null;

export function onToast(fn: ToastFn): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function toast(message: string, kind: ToastKind = "ok") {
  listener?.(message, kind);
}
