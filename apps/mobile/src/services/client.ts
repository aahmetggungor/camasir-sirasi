import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createLaundryClient, type StorageAdapter } from "@camasir/core";
import { createSecureStorage } from "./secureStorage";

// Telefonda oturum token'ı işletim sisteminin güvenli deposunda tutulur.
// Web yalnız geliştirme önizlemesidir; tarayıcıda aynı arayüzü kullanıyoruz.
const storage: StorageAdapter =
  Platform.OS === "web"
    ? {
        getItem: (key) =>
          typeof localStorage !== "undefined"
            ? localStorage.getItem(key)
            : null,
        setItem: (key, value) => {
          if (typeof localStorage !== "undefined")
            localStorage.setItem(key, value);
        },
        removeItem: (key) => {
          if (typeof localStorage !== "undefined") localStorage.removeItem(key);
        },
      }
    : createSecureStorage(SecureStore);

const presentation =
  process.env.EXPO_PUBLIC_DEMO_MODE === "true" ||
  (Platform.OS === "web" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1");
export const client = createLaundryClient({
  url: presentation ? undefined : process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: presentation
    ? undefined
    : process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  storage,
  detectSessionInUrl: false,
});
