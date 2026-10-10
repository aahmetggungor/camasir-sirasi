import { createClient, type User } from "@supabase/supabase-js";
import { machineCode } from "./machines";
import type {
  LaundryClient,
  StorageAdapter,
  UserProfile,
  Snapshot,
  InvitePreview,
  Slot,
  SpaceRules,
  MachineStatus,
} from "./types";

function profile(u: User): UserProfile {
  return {
    id: u.id,
    email: u.email ?? "",
    name: String(u.user_metadata?.name ?? u.email?.split("@")[0] ?? "Üye"),
  };
}
export function createRemoteClient(
  url: string,
  publishableKey: string,
  storage?: StorageAdapter,
  detectSessionInUrl?: boolean,
): LaundryClient {
  const supabase = createClient(url, publishableKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: detectSessionInUrl ?? typeof window !== "undefined",
    },
  });
  async function command<T = void>(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await supabase.rpc("cs_command", {
      p_action: action,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    return data as T;
  }
  return {
    mode: "supabase",
    async getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) return null;
      return user ? profile(user) : null;
    },
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error)
        throw new Error(
          error.message === "Invalid login credentials"
            ? "E-posta veya parola yanlış."
            : error.message,
        );
      return profile(data.user);
    },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) throw new Error(error.message);
      return {
        user: data.user ? profile(data.user) : null,
        needsVerification: !data.session,
      };
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
    },
    async getSnapshot() {
      // Saat dolması yalnızca teslim alınmayı beklemeye geçer; fiziksel boşalma QR/kullanıcı onayıdır.
      await command("refreshTimers");
      const { data, error } = await supabase.rpc("cs_snapshot");
      if (error) throw new Error(error.message);
      return data as Snapshot;
    },
    createSpace: (name, kind) => command<string>("createSpace", { name, kind }),
    previewInvite: (code) => command<InvitePreview>("previewInvite", { code }),
    requestMembership: (code, room) =>
      command("requestMembership", { code, room }),
    approveMember: (membershipId, verified) =>
      command("approveMember", { membershipId, verified }),
    rejectMember: (membershipId, reason) =>
      command("rejectMember", { membershipId, reason }),
    blockMember: (membershipId) => command("blockMember", { membershipId }),
    createInvite: (spaceId) =>
      command<{ code: string; expiresAt: string }>("createInvite", { spaceId }),
    saveRules: (spaceId: string, rules: SpaceRules) =>
      command("saveRules", { spaceId, rules }),
    addMachine: (spaceId, name, programs, type = "washer") =>
      command("addMachine", { spaceId, name, programs, machineType: type }),
    setMachineStatus: (machineId: string, status: MachineStatus) =>
      command("setMachineStatus", { machineId, status }),
    addProgram: (machineId, name, durationMinutes) =>
      command("addProgram", { machineId, name, durationMinutes }),
    resolveMachine: (machineQr) =>
      command("resolveMachine", { machineQr: machineCode(machineQr) }),
    startWalkIn: (machineQr, programId) =>
      command("startWalkIn", { machineQr: machineCode(machineQr), programId }),
    watchMachine: (machineId, enabled) =>
      command("watchMachine", { machineId, enabled }),
    getAvailability: (machineId, programId, day) =>
      command<Slot[]>("getAvailability", { machineId, programId, day }),
    reserve: (machineId, programId, startsAt) =>
      command<string>("reserve", { machineId, programId, startsAt }),
    cancelReservation: (reservationId) =>
      command("cancelReservation", { reservationId }),
    startUsage: (reservationId, machineQr) =>
      command("startUsage", {
        reservationId,
        machineQr: machineCode(machineQr),
      }),
    finishUsage: (reservationId) => command("finishUsage", { reservationId }),
    joinWaitlist: (spaceId, programId, availableUntil) =>
      command("joinWaitlist", { spaceId, programId, availableUntil }),
    leaveWaitlist: (entryId) => command("leaveWaitlist", { entryId }),
    acceptOffer: (offerId) => command("acceptOffer", { offerId }),
    declineOffer: (offerId) => command("declineOffer", { offerId }),
    refreshTimers: () => command("refreshTimers"),
    subscribe(listener) {
      const channel = supabase
        .channel(`cs-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_machines" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_memberships" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_reservations" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_offers" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_notifications" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_machine_watches" },
          listener,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cs_programs" },
          listener,
        )
        .subscribe();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(() => listener());
      // Realtime does not deliver invisible/deleted rows. Poll also handles clock and revocation.
      const interval = setInterval(listener, 30_000);
      return () => {
        clearInterval(interval);
        subscription.unsubscribe();
        void supabase.removeChannel(channel);
      };
    },
  };
}
