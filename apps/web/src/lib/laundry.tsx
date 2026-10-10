"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createLaundryClient,
  type LaundryClient,
  type Snapshot,
  type UserProfile,
} from "@camasir/core";

type Notice = { kind: "success" | "error"; text: string };
type LaundryContextValue = {
  client: LaundryClient | null;
  profile: UserProfile | null;
  snapshot: Snapshot | null;
  loading: boolean;
  busy: string | null;
  notice: Notice | null;
  setNotice: (notice: Notice | null) => void;
  refresh: () => Promise<void>;
  run: <T>(
    label: string,
    action: (client: LaundryClient) => Promise<T>,
    success?: string,
  ) => Promise<T | undefined>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const LaundryContext = createContext<LaundryContextValue | null>(null);
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";

/** Web and native apps call the same SDK. The browser never receives a secret key. */
export function LaundryProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<LaundryClient | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    const presentation =
      new URLSearchParams(window.location.search).get("demo") === "1";
    const instance = createLaundryClient({
      url: presentation ? undefined : process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: presentation
        ? undefined
        : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      storage: {
        getItem: (key: string) => localStorage.getItem(key),
        setItem: (key: string, value: string) =>
          localStorage.setItem(key, value),
        removeItem: (key: string) => localStorage.removeItem(key),
      },
    });
    setClient(instance);
    let alive = true;
    void instance
      .getSession()
      .then(async (user) => {
        if (!alive) return;
        setProfile(user);
        if (user) setSnapshot(await instance.getSnapshot());
      })
      .catch((error: unknown) => {
        if (alive) setNotice({ kind: "error", text: errorText(error) });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!client || refreshing.current) return;
    refreshing.current = true;
    try {
      const user = await client.getSession();
      setProfile(user);
      setSnapshot(user ? await client.getSnapshot() : null);
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      refreshing.current = false;
    }
  }, [client]);

  useEffect(() => {
    if (!client || !profile) return;
    const unsubscribe = client.subscribe(() => {
      void refresh();
    });
    const timer = window.setInterval(() => {
      void client
        .refreshTimers()
        .then(refresh)
        .catch((error: unknown) =>
          setNotice({ kind: "error", text: errorText(error) }),
        );
    }, 15_000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [client, profile, refresh]);

  const run = useCallback(
    async <T,>(
      label: string,
      action: (instance: LaundryClient) => Promise<T>,
      success?: string,
    ): Promise<T | undefined> => {
      if (!client) return;
      setBusy(label);
      setNotice(null);
      try {
        const result = await action(client);
        await refresh();
        if (success) setNotice({ kind: "success", text: success });
        return result;
      } catch (error) {
        setNotice({ kind: "error", text: errorText(error) });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [client, refresh],
  );

  async function signIn(email: string, password: string) {
    if (!client) return;
    setBusy("Giriş yapılıyor");
    setNotice(null);
    try {
      setProfile(await client.signIn(email.trim(), password));
      setSnapshot(await client.getSnapshot());
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function signUp(name: string, email: string, password: string) {
    if (!client) return false;
    setBusy("Hesap oluşturuluyor");
    setNotice(null);
    try {
      const result = await client.signUp(name.trim(), email.trim(), password);
      if (result.needsVerification) {
        setNotice({
          kind: "success",
          text: "Doğrulama bağlantısını e-posta adresine gönderdik. Bağlantıyı açtıktan sonra giriş yapabilirsin.",
        });
      } else if (result.user) {
        setProfile(result.user);
        setSnapshot(await client.getSnapshot());
      }
      return result.needsVerification;
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (!client) return;
    try {
      await client.signOut();
      setProfile(null);
      setSnapshot(null);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    }
  }

  return (
    <LaundryContext.Provider
      value={{
        client,
        profile,
        snapshot,
        loading,
        busy,
        notice,
        setNotice,
        refresh,
        run,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </LaundryContext.Provider>
  );
}

export function useLaundry() {
  const context = useContext(LaundryContext);
  if (!context) throw new Error("LaundryProvider bulunamadı.");
  return context;
}
