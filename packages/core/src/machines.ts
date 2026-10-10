import type { Machine } from "./types";

/** QR is a machine selector, never a membership invitation or an access grant. */
export function machineCode(value: string): string {
  const raw = value.trim();
  if (raw.includes("://")) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "camasirsirasi:" || url.hostname !== "machine")
        return "";
      return url.searchParams.get("code")?.trim() ?? "";
    } catch {
      return "";
    }
  }
  return /^[a-zA-Z0-9-]{8,128}$/.test(raw) ? raw : "";
}
export function machineLink(token: string): string {
  return `camasirsirasi://machine?code=${encodeURIComponent(token)}`;
}
export function countdown(end: string | null, now = Date.now()): string {
  if (!end) return "Süre bilgisi yok";
  const seconds = Math.max(0, Math.ceil((Date.parse(end) - now) / 1000));
  if (!Number.isFinite(seconds)) return "Süre bilgisi yok";
  if (!seconds) return "Süre doldu · teslim bekleniyor";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function activeMachines(
  machines: Machine[],
  now = Date.now(),
): Machine[] {
  return machines
    .filter((m) => ["running", "awaiting_pickup"].includes(m.status))
    .sort(
      (a, b) =>
        Math.max(0, Date.parse(b.estimatedEndAt ?? "") - now || 0) -
          Math.max(0, Date.parse(a.estimatedEndAt ?? "") - now || 0) ||
        a.name.localeCompare(b.name, "tr"),
    );
}
