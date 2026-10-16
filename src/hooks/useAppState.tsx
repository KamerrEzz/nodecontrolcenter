// Application state: snapshot polling + settings, shared through context.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import type { AppSettings, Snapshot } from "../types";

interface AppState {
  snapshot: Snapshot | null;
  settings: AppSettings | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const StateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used inside <StateProvider>");
  return ctx;
}

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const snap = await api.getSnapshot();
      setSnapshot(snap);
      setError(snap.errors.length ? snap.errors.join(" · ") : null);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(`snapshot failed: ${String(e)}`);
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getSettings();
        if (!cancelled) setSettings(s);
        // First run: adopt the OS language if we never showed this before.
        if (!cancelled && !window.localStorage.getItem("ncc-onboarded")) {
          window.localStorage.setItem("ncc-onboarded", "1");
          if (navigator.language.toLowerCase().startsWith("es") && s.language !== "es") {
            const saved = await api.saveSettings({ ...s, language: "es" });
            if (!cancelled) setSettings(saved);
          }
        }
      } catch (e) {
        if (!cancelled) setError(`settings failed: ${String(e)}`);
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Auto refresh interval.
  const interval = settings?.autoRefresh ? (settings.refreshIntervalSecs ?? 5) * 1000 : null;
  useEffect(() => {
    if (!interval) return;
    const id = window.setInterval(refresh, interval);
    return () => window.clearInterval(id);
  }, [interval, refresh]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    if (!patch) return;
    try {
      const merged = { ...(settings ?? ({} as AppSettings)), ...patch };
      const saved = await api.saveSettings(merged);
      setSettings(saved);
    } catch (e) {
      setError(`could not save settings: ${String(e)}`);
    }
  }, [settings]);
  const value = useMemo<AppState>(
    () => ({ snapshot, settings, loading, refreshing, error, lastUpdated, refresh, updateSettings }),
    [snapshot, settings, loading, refreshing, error, lastUpdated, refresh, updateSettings],
  );

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}
