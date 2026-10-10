import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { Snapshot, UserProfile } from "@camasir/core";
import { client } from "../services/client";
import { errorMessage } from "../services/format";

// Ekranlar veritabanı kurallarını tekrarlamaz. Tek istemci her işlemi sunucuya iletir.
export function useLaundry() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fetching = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (fetching.current) {
      pending.current = true;
      return;
    }
    fetching.current = true;
    if (mounted.current) setRefreshing(true);
    try {
      const session = await client.getSession();
      const data = session ? await client.getSnapshot() : null;
      if (mounted.current) {
        setProfile(session);
        setSnapshot(data);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause));
        setSnapshot(null);
      }
    } finally {
      fetching.current = false;
      if (mounted.current) setRefreshing(false);
      if (pending.current && mounted.current) {
        pending.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh().finally(() => {
      if (mounted.current) setInitializing(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = client.subscribe(() => {
      if (AppState.currentState === "active") void refresh();
    });
    // Cron sunucuda çalışır. Bu yalnız açık ekran için yenileme isteğidir.
    // Arka planda gizli bir sayaç işletmiyoruz.
    const tick = async () => {
      if (AppState.currentState !== "active") return;
      try {
        await client.refreshTimers();
        await refresh();
      } catch (cause) {
        if (mounted.current) setError(errorMessage(cause));
      }
    };
    const timer = setInterval(() => void tick(), 20_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void tick();
    });
    return () => {
      unsubscribe();
      clearInterval(timer);
      appState.remove();
    };
  }, [profile?.id, refresh]);

  const act = useCallback(
    async (operation: () => Promise<unknown>, success = "") => {
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await operation();
        await refresh();
        if (success) setMessage(success);
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    profile,
    snapshot,
    initializing,
    refreshing,
    busy,
    error,
    message,
    refresh,
    act,
    clearNotice: () => {
      setError("");
      setMessage("");
    },
    setMessage,
  };
}
export type LaundryState = ReturnType<typeof useLaundry>;
