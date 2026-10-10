import type { LaundryClient, StorageAdapter } from "./types";
import { createDemoClient } from "./demo";
import { createRemoteClient } from "./remote";
export * from "./types";
export { DEFAULT_RULES } from "./rules";
export interface ClientOptions {
  url?: string;
  publishableKey?: string;
  storage?: StorageAdapter;
  detectSessionInUrl?: boolean;
}
/** Ortak sözleşme: web ve mobil yalnız bu istemciyi kullanır. */
export function createLaundryClient(
  options: ClientOptions = {},
): LaundryClient {
  if (Boolean(options.url) !== Boolean(options.publishableKey)) {
    throw new Error("Supabase URL ve publishable key birlikte girilmelidir.");
  }
  return options.url && options.publishableKey
    ? createRemoteClient(
        options.url,
        options.publishableKey,
        options.storage,
        options.detectSessionInUrl,
      )
    : createDemoClient(options.storage);
}
