/** WhatsApp'tan gelen bağlantı yalnız davet kodunu taşır, üyelik onayı vermez. */
export function inviteFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "camasirsirasi:" || url.hostname !== "join")
      return null;
    const code =
      url.searchParams.get("code") ?? url.pathname.replace(/^\//, "");
    return /^[a-zA-Z0-9-]{4,100}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
