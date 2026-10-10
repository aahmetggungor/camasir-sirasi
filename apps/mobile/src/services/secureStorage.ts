import type { StorageAdapter } from "@camasir/core";

type NativeStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
const CHUNK_SIZE = 500; // 500 Unicode kod noktası UTF-8'de en fazla 2000 bayttır.
const PREFIX = "cs-chunks-v1";

/** Büyük oturum/demo değerleri de işletim sisteminin şifreli deposunda kalır. */
export function createSecureStorage(store: NativeStore): StorageAdapter {
  let version = 0;
  const queues = new Map<string, Promise<unknown>>();
  const lastWritten = new Map<string, string>();
  const serialize = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const result = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work);
    queues.set(key, result);
    return result;
  };
  const metadata = (raw: string | null) => {
    const match = raw?.match(/^cs-chunks-v1:([a-z0-9]+):(\d+)$/);
    if (!match) return null;
    const count = Number(match[2]);
    if (!Number.isInteger(count) || count < 1 || count > 4096)
      throw new Error("Oturum deposu okunamadı. Tekrar giriş yap.");
    return { version: match[1], count };
  };
  const chunkKeys = (key: string, meta: ReturnType<typeof metadata>) =>
    meta
      ? Array.from(
          { length: meta.count },
          (_, index) => `${key}.${meta.version}.${index}`,
        )
      : [];
  const cleanup = async (keys: string[]) => {
    await Promise.allSettled(keys.map((key) => store.deleteItemAsync(key)));
  };

  return {
    getItem: (key) =>
      serialize(key, async () => {
        const raw = await store.getItemAsync(key);
        const meta = metadata(raw);
        if (!meta) return raw;
        const parts = await Promise.all(
          chunkKeys(key, meta).map((part) => store.getItemAsync(part)),
        );
        if (parts.some((part) => part === null))
          throw new Error("Oturum deposu eksik. Tekrar giriş yap.");
        return parts.join("");
      }),
    setItem: (key, value) =>
      serialize(key, async () => {
        if (lastWritten.get(key) === value) return;
        const previous = metadata(await store.getItemAsync(key));
        const characters = Array.from(value); // Emoji surrogate çiftleri iki parçaya bölünmez.
        const pieces = Array.from(
          { length: Math.max(1, Math.ceil(characters.length / CHUNK_SIZE)) },
          (_, i) =>
            characters.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join(""),
        );
        const next = {
          version: `${Date.now().toString(36)}${(++version).toString(36)}`,
          count: pieces.length,
        };
        const keys = chunkKeys(key, next);
        try {
          const writes = await Promise.allSettled(
            keys.map((part, i) => store.setItemAsync(part, pieces[i])),
          );
          const failed = writes.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          if (failed) throw failed.reason;
          // Önce parçalar, en son ana kayıt: yarım yazılmış oturum okunmaz.
          await store.setItemAsync(
            key,
            `${PREFIX}:${next.version}:${next.count}`,
          );
        } catch (cause) {
          await cleanup(keys);
          throw cause;
        }
        lastWritten.set(key, value);
        await cleanup(chunkKeys(key, previous));
      }),
    removeItem: (key) =>
      serialize(key, async () => {
        const previous = metadata(await store.getItemAsync(key));
        await store.deleteItemAsync(key);
        lastWritten.delete(key);
        await cleanup(chunkKeys(key, previous));
      }),
  };
}
