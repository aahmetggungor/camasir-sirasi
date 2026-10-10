import type {
  LaundryClient,
  StorageAdapter,
  Snapshot,
  UserProfile,
  Space,
  Membership,
  Machine,
  Program,
  Reservation,
  WaitlistEntry,
  Offer,
  Notification,
  Slot,
} from "./types";
import { DEFAULT_RULES, validateRules } from "./rules";

type DemoState = {
  session: string | null;
  users: UserProfile[];
  spaces: Space[];
  memberships: Membership[];
  machines: Machine[];
  programs: Program[];
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  offers: Offer[];
  notifications: Array<Notification & { userId: string }>;
  invites: Array<{ code: string; spaceId: string; expiresAt: string }>;
  deadlines: Record<string, string>;
  current: Record<string, string>;
};
const KEY = "camasirsirasi-demo-v1";
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const id = () =>
  `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const time = (s: string) => new Date(s).getTime();
const minutes = (n: number) => n * 60_000;
const overlap = (a: number, b: number, c: number, d: number) => a < d && c < b;
const live = (r: Reservation) =>
  ["offered", "confirmed", "running"].includes(r.status);
function localParts(at: number): { day: string; hour: number } {
  const shifted = new Date(at + 3 * 3_600_000); // İlk sürüm alan saat dilimi Europe/Istanbul.
  return {
    day: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
  };
}
function seed(): DemoState {
  const users = [
    { id: "demo-owner", name: "Ahmet Güngör", email: "owner@demo.local" },
    { id: "demo-member", name: "Deniz Kaya", email: "member@demo.local" },
    { id: "demo-pending", name: "Ece Yılmaz", email: "pending@demo.local" },
  ];
  return {
    session: null,
    users,
    spaces: [
      {
        id: "demo-space",
        name: "Kuzey Yurdu",
        kind: "Yurt",
        ownerId: "demo-owner",
        timezone: "Europe/Istanbul",
        role: "owner",
        membershipStatus: "active",
        rules: { ...DEFAULT_RULES },
      },
    ],
    memberships: users.map((u, i) => ({
      id: `demo-membership-${i}`,
      spaceId: "demo-space",
      userId: u.id,
      name: u.name,
      email: u.email,
      room: ["Yönetim", "204", "312"][i],
      role: i === 0 ? "owner" : "member",
      status: i === 2 ? "pending" : "active",
      createdAt: iso(),
    })),
    machines: [1, 2, 3].map((n) => ({
      id: `demo-machine-${n}`,
      spaceId: "demo-space",
      name: `Çamaşır Makinesi ${n}`,
      status: n === 3 ? "out_of_order" : "available",
      qrToken: `CAMASIR-DEMO-${n}`,
      estimatedEndAt: null,
    })),
    programs: [1, 2, 3].flatMap((n) => [
      {
        id: `demo-program-${n}-quick`,
        machineId: `demo-machine-${n}`,
        name: "Hızlı yıkama",
        durationMinutes: 30,
      },
      {
        id: `demo-program-${n}-cotton`,
        machineId: `demo-machine-${n}`,
        name: "Pamuklu 40°",
        durationMinutes: 60,
      },
    ]),
    reservations: [],
    waitlist: [],
    offers: [],
    notifications: [],
    invites: [
      {
        code: "KUZEY2026",
        spaceId: "demo-space",
        expiresAt: iso(Date.now() + 7 * 86_400_000),
      },
    ],
    deadlines: {},
    current: {},
  };
}

/** Sadece sunum verisi. Gerçek üyelik güvenliği ve oturum doğrulaması Supabase'dedir. */
export function createDemoClient(storage?: StorageAdapter): LaundryClient {
  let memory = seed();
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  async function load(): Promise<DemoState> {
    const raw = await storage?.getItem(KEY);
    if (raw) {
      try {
        memory = JSON.parse(raw) as DemoState;
      } catch {
        memory = seed();
      }
    }
    return memory;
  }
  function user(db: DemoState) {
    const u = db.users.find((u) => u.id === db.session);
    if (!u) throw new Error("Önce giriş yapmalısınız.");
    return u;
  }
  function space(db: DemoState, sid: string, admin = false) {
    const u = user(db);
    const mm = db.memberships.find(
      (m) => m.spaceId === sid && m.userId === u.id && m.status === "active",
    );
    if (!mm || (admin && !["owner", "admin"].includes(mm.role)))
      throw new Error("Bu alan için yetkiniz yok veya üyeliğiniz aktif değil.");
    const s = db.spaces.find((s) => s.id === sid);
    if (!s) throw new Error("Alan bulunamadı.");
    return s;
  }
  function machine(db: DemoState, mid: string) {
    const m = db.machines.find((m) => m.id === mid);
    if (!m) throw new Error("Makine bulunamadı.");
    space(db, m.spaceId);
    return m;
  }
  function program(db: DemoState, pid: string, mid?: string) {
    const p = db.programs.find(
      (p) => p.id === pid && (!mid || p.machineId === mid),
    );
    if (!p) throw new Error("Program bu makineye ait değil.");
    return p;
  }
  function notify(db: DemoState, uid: string, title: string, body: string) {
    db.notifications.unshift({
      id: id(),
      userId: uid,
      title,
      body,
      createdAt: iso(),
    });
  }
  function hasRight(db: DemoState, sid: string, uid: string) {
    return (
      db.reservations.some(
        (r) => r.spaceId === sid && r.userId === uid && live(r),
      ) ||
      db.waitlist.some(
        (w) =>
          w.spaceId === sid &&
          w.userId === uid &&
          ["waiting", "offered"].includes(w.status),
      )
    );
  }
  function quota(
    db: DemoState,
    s: Space,
    uid: string,
    at: number,
    skip?: string,
  ) {
    const { day, hour } = localParts(at);
    const taken = db.reservations.filter(
      (r) =>
        r.spaceId === s.id &&
        r.userId === uid &&
        r.id !== skip &&
        r.status !== "cancelled" &&
        localParts(time(r.startsAt)).day === day,
    );
    return (
      taken.length < s.rules.dailyLimit &&
      (hour < s.rules.peakStartHour ||
        hour >= s.rules.peakEndHour ||
        taken.filter((r) => {
          const h = localParts(time(r.startsAt)).hour;
          return h >= s.rules.peakStartHour && h < s.rules.peakEndHour;
        }).length < s.rules.peakDailyLimit)
    );
  }
  function inHours(s: Space, a: number, b: number) {
    const start = localParts(a),
      end = localParts(b - 1);
    return (
      start.day === end.day &&
      start.hour >= s.rules.openHour &&
      b <=
        time(
          `${start.day}T${String(s.rules.closeHour === 24 ? 0 : s.rules.closeHour).padStart(2, "0")}:00:00+03:00`,
        ) +
          (s.rules.closeHour === 24 ? 86_400_000 : 0)
    );
  }
  function tick(db: DemoState) {
    const now = Date.now();
    const active = new Set(
      db.memberships
        .filter((m) => m.userId === db.session && m.status === "active")
        .map((m) => m.spaceId),
    );
    for (const o of db.offers.filter(
      (o) =>
        active.has(o.spaceId) &&
        o.status === "pending" &&
        time(o.expiresAt) <= now,
    )) {
      o.status = "expired";
      const r = db.reservations.find((r) => r.id === o.reservationId);
      if (r && r.status === "offered") r.status = "cancelled";
      const w = db.waitlist.find(
        (w) =>
          w.userId === o.userId &&
          w.spaceId === o.spaceId &&
          w.status === "offered",
      );
      if (w) w.status = "cancelled";
      notify(
        db,
        o.userId,
        "Teklif süresi doldu",
        "Yeniden sıraya katılabilirsiniz.",
      );
    }
    for (const w of db.waitlist)
      if (
        active.has(w.spaceId) &&
        w.status === "waiting" &&
        time(w.availableUntil) <= now
      )
        w.status = "cancelled";
    for (const m of db.machines.filter((m) => active.has(m.spaceId))) {
      if (
        m.status === "running" &&
        m.estimatedEndAt &&
        time(m.estimatedEndAt) <= now
      )
        m.status = "awaiting_pickup";
      const s = db.spaces.find((s) => s.id === m.spaceId)!;
      for (const r of db.reservations.filter(
        (r) =>
          r.machineId === m.id &&
          r.status === "confirmed" &&
          time(r.startsAt) <= now,
      )) {
        if (m.status !== "available")
          db.deadlines[r.id] = iso(now + minutes(s.rules.startGraceMinutes));
        else if (time(db.deadlines[r.id]) <= now) {
          r.status = "no_show";
          notify(
            db,
            r.userId,
            "Rezervasyon süresi geçti",
            "Başlatılmayan kullanım hakkı bırakıldı.",
          );
        }
      }
      if (
        m.status !== "available" ||
        db.reservations.some(
          (r) =>
            r.machineId === m.id &&
            live(r) &&
            time(r.startsAt) <= now &&
            time(r.endsAt) > now,
        )
      )
        continue;
      const waiting = db.waitlist
        .filter(
          (w) =>
            w.spaceId === s.id &&
            w.status === "waiting" &&
            db.programs.find((p) => p.id === w.programId)?.machineId === m.id,
        )
        .sort((a, b) => time(a.createdAt) - time(b.createdAt));
      for (const w of waiting) {
        const p = program(db, w.programId);
        const end =
          now +
          minutes(
            s.rules.offerMinutes +
              s.rules.arrivalMinutes +
              p.durationMinutes +
              s.rules.pickupMinutes,
          );
        if (
          !db.memberships.some(
            (mm) =>
              mm.spaceId === s.id &&
              mm.userId === w.userId &&
              mm.status === "active",
          ) ||
          time(w.availableUntil) <
            now + minutes(s.rules.offerMinutes + s.rules.arrivalMinutes) ||
          !inHours(s, now, end) ||
          !quota(db, s, w.userId, now) ||
          db.reservations.some(
            (r) => r.userId === w.userId && r.spaceId === s.id && live(r),
          ) ||
          db.reservations.some(
            (r) =>
              r.machineId === m.id &&
              live(r) &&
              overlap(now, end, time(r.startsAt), time(r.endsAt)),
          )
        )
          continue;
        const u = db.users.find((u) => u.id === w.userId)!;
        const rid = id();
        db.reservations.push({
          id: rid,
          spaceId: s.id,
          userId: u.id,
          userName: u.name,
          machineId: m.id,
          programId: p.id,
          startsAt: iso(now),
          endsAt: iso(end),
          status: "offered",
          startedAt: null,
          estimatedEndAt: null,
        });
        db.deadlines[rid] = iso(
          now + minutes(s.rules.offerMinutes + s.rules.arrivalMinutes),
        );
        db.offers.push({
          id: id(),
          spaceId: s.id,
          userId: u.id,
          machineId: m.id,
          programId: p.id,
          reservationId: rid,
          expiresAt: iso(now + minutes(s.rules.offerMinutes)),
          status: "pending",
        });
        w.status = "offered";
        notify(
          db,
          u.id,
          "Makine sizin için boşaldı",
          "Teklifi süresi dolmadan kabul edin.",
        );
        break;
      }
    }
  }
  async function run<T>(fn: (db: DemoState) => T | Promise<T>): Promise<T> {
    const next = queue.then(async () => {
      const db = await load();
      const before = JSON.stringify(db);
      try {
        tick(db);
        const out = await fn(db);
        tick(db);
        const after = JSON.stringify(db);
        await storage?.setItem(KEY, after);
        if (after !== before) listeners.forEach((fn) => fn());
        return out;
      } catch (error) {
        memory = JSON.parse(before);
        throw error;
      }
    });
    queue = next.catch(() => {});
    return next;
  }
  function reservation(db: DemoState, rid: string, admin = false) {
    const r = db.reservations.find((r) => r.id === rid);
    if (!r) throw new Error("Rezervasyon bulunamadı.");
    space(db, r.spaceId);
    if (
      r.userId !== user(db).id &&
      (!admin ||
        !db.memberships.some(
          (m) =>
            m.userId === db.session &&
            m.spaceId === r.spaceId &&
            m.status === "active" &&
            ["owner", "admin"].includes(m.role),
        ))
    )
      throw new Error("Bu kullanım size ait değil.");
    return r;
  }
  return {
    mode: "demo",
    getSession: () =>
      run((db) => db.users.find((u) => u.id === db.session) ?? null),
    signIn: (email, password) =>
      run((db) => {
        const u = db.users.find((u) => u.email === email.trim().toLowerCase());
        if (!u || password !== "demo12345")
          throw new Error("Demo hesabı parolası demo12345.");
        db.session = u.id;
        return u;
      }),
    signUp: (name, email, password) =>
      run((db) => {
        if (password !== "demo12345")
          throw new Error(
            "Yerel demo için demo12345 parolasını kullanın. Gerçek hesaplar Supabase bağlantısında açılır.",
          );
        if (!name.trim() || !email.includes("@"))
          throw new Error("Ad ve e-posta girin.");
        if (db.users.some((u) => u.email === email.trim().toLowerCase()))
          throw new Error("Bu demo e-postası zaten kayıtlı.");
        const u = {
          id: id(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
        };
        db.users.push(u);
        db.session = u.id;
        return { user: u, needsVerification: false };
      }),
    signOut: () =>
      run((db) => {
        db.session = null;
      }),
    getSnapshot: () =>
      run((db) => {
        const u = user(db);
        const mine = db.memberships.filter((m) => m.userId === u.id);
        const active = new Set(
          mine.filter((m) => m.status === "active").map((m) => m.spaceId),
        );
        const admins = new Set(
          mine
            .filter(
              (m) =>
                m.status === "active" && ["owner", "admin"].includes(m.role),
            )
            .map((m) => m.spaceId),
        );
        const snapshot: Snapshot = {
          profile: u,
          spaces: db.spaces
            .filter((s) => mine.some((m) => m.spaceId === s.id))
            .map((s) => {
              const mm = mine.find((m) => m.spaceId === s.id)!;
              return { ...s, role: mm.role, membershipStatus: mm.status };
            }),
          memberships: db.memberships.filter(
            (m) => m.userId === u.id || admins.has(m.spaceId),
          ),
          machines: db.machines.filter((m) => active.has(m.spaceId)),
          programs: db.programs.filter((p) =>
            db.machines.some(
              (m) => m.id === p.machineId && active.has(m.spaceId),
            ),
          ),
          reservations: db.reservations.filter((r) => active.has(r.spaceId)),
          waitlist: db.waitlist.filter(
            (w) =>
              active.has(w.spaceId) &&
              (w.userId === u.id || admins.has(w.spaceId)),
          ),
          offers: db.offers.filter(
            (o) =>
              active.has(o.spaceId) &&
              (o.userId === u.id || admins.has(o.spaceId)),
          ),
          notifications: db.notifications
            .filter((n) => n.userId === u.id)
            .map(({ userId, ...n }) => n),
        };
        return JSON.parse(JSON.stringify(snapshot)) as Snapshot;
      }),
    createSpace: (name, kind) =>
      run((db) => {
        const u = user(db);
        if (name.trim().length < 2)
          throw new Error("Alan adı en az iki harf olmalıdır.");
        const sid = id();
        db.spaces.push({
          id: sid,
          name: name.trim(),
          kind,
          ownerId: u.id,
          timezone: "Europe/Istanbul",
          role: "owner",
          membershipStatus: "active",
          rules: { ...DEFAULT_RULES },
        });
        db.memberships.push({
          id: id(),
          spaceId: sid,
          userId: u.id,
          name: u.name,
          email: u.email,
          room: "Yönetim",
          role: "owner",
          status: "active",
          createdAt: iso(),
        });
        return sid;
      }),
    previewInvite: (code) =>
      run((db) => {
        user(db);
        const i = db.invites.find(
          (i) =>
            i.code === code.trim().toUpperCase() &&
            time(i.expiresAt) > Date.now(),
        );
        if (!i) throw new Error("Davet kodu geçersiz veya süresi dolmuş.");
        return {
          spaceId: i.spaceId,
          spaceName: db.spaces.find((s) => s.id === i.spaceId)!.name,
          expiresAt: i.expiresAt,
        };
      }),
    requestMembership: (code, room) =>
      run((db) => {
        const u = user(db);
        const i = db.invites.find(
          (i) =>
            i.code === code.trim().toUpperCase() &&
            time(i.expiresAt) > Date.now(),
        );
        if (!i) throw new Error("Davet kodu geçersiz veya süresi dolmuş.");
        const existing = db.memberships.find(
          (m) => m.userId === u.id && m.spaceId === i.spaceId,
        );
        if (existing)
          throw new Error(
            ["blocked", "removed", "rejected"].includes(existing.status)
              ? "Yönetici kararı olmadan yeniden katılamazsınız."
              : "Bu alanda zaten üyeliğiniz veya başvurunuz var.",
          );
        db.memberships.push({
          id: id(),
          spaceId: i.spaceId,
          userId: u.id,
          name: u.name,
          email: u.email,
          room: room.trim(),
          role: "member",
          status: "pending",
          createdAt: iso(),
        });
      }),
    approveMember: (membershipId, verified) =>
      run((db) => {
        const mm = db.memberships.find((m) => m.id === membershipId);
        if (!mm) throw new Error("Üyelik bulunamadı.");
        space(db, mm.spaceId, true);
        if (!verified)
          throw new Error("Kişiyi kurum kayıtlarından doğrulayın.");
        if (mm.role === "owner" || mm.userId === db.session)
          throw new Error("Bu üyelik değiştirilemez.");
        mm.status = "active";
        notify(
          db,
          mm.userId,
          "Üyeliğiniz onaylandı",
          "Artık makineleri kullanabilirsiniz.",
        );
      }),
    rejectMember: (membershipId, reason) =>
      run((db) => {
        void reason;
        const mm = db.memberships.find((m) => m.id === membershipId);
        if (!mm) throw new Error("Üyelik bulunamadı.");
        space(db, mm.spaceId, true);
        if (mm.role === "owner" || mm.userId === db.session)
          throw new Error("Bu üyelik değiştirilemez.");
        mm.status = "rejected";
        revokeFuture(db, mm);
      }),
    blockMember: (membershipId) =>
      run((db) => {
        const mm = db.memberships.find((m) => m.id === membershipId);
        if (!mm) throw new Error("Üyelik bulunamadı.");
        space(db, mm.spaceId, true);
        if (mm.role === "owner" || mm.userId === db.session)
          throw new Error("Bu üyelik değiştirilemez.");
        mm.status = "blocked";
        revokeFuture(db, mm);
      }),
    createInvite: (spaceId) =>
      run((db) => {
        space(db, spaceId, true);
        db.invites = db.invites.filter((i) => i.spaceId !== spaceId);
        const i = {
          code: id()
            .replace(/[^a-z0-9]/gi, "")
            .toUpperCase(),
          spaceId,
          expiresAt: iso(Date.now() + 7 * 86_400_000),
        };
        db.invites.push(i);
        return { code: i.code, expiresAt: i.expiresAt };
      }),
    saveRules: (spaceId, rules) =>
      run((db) => {
        const s = space(db, spaceId, true);
        validateRules(rules);
        s.rules = { ...rules };
      }),
    addMachine: (spaceId, name, programs) =>
      run((db) => {
        space(db, spaceId, true);
        if (
          !name.trim() ||
          !programs.length ||
          programs.some(
            (p) =>
              !p.name.trim() ||
              !Number.isInteger(p.durationMinutes) ||
              p.durationMinutes < 10 ||
              p.durationMinutes > 240,
          )
        )
          throw new Error(
            "Makine adı ve 10–240 dakika arasında program girin.",
          );
        const mid = id();
        db.machines.push({
          id: mid,
          spaceId,
          name: name.trim(),
          status: "available",
          qrToken: id(),
          estimatedEndAt: null,
        });
        db.programs.push(
          ...programs.map((p) => ({ id: id(), machineId: mid, ...p })),
        );
      }),
    setMachineStatus: (machineId, status) =>
      run((db) => {
        const m = machine(db, machineId);
        space(db, m.spaceId, true);
        if (
          !["available", "out_of_order", "needs_check"].includes(status) ||
          db.current[m.id]
        )
          throw new Error("Aktif kullanım varsa önce çamaşırları teslim alın.");
        m.status = status;
        if (status !== "available") {
          db.reservations
            .filter(
              (r) =>
                r.machineId === m.id &&
                ["offered", "confirmed"].includes(r.status),
            )
            .forEach((r) => (r.status = "cancelled"));
          db.offers
            .filter((o) => o.machineId === m.id && o.status === "pending")
            .forEach((o) => (o.status = "declined"));
          db.waitlist
            .filter(
              (w) =>
                program(db, w.programId).machineId === m.id &&
                ["waiting", "offered"].includes(w.status),
            )
            .forEach((w) => (w.status = "cancelled"));
        }
      }),
    getAvailability: (machineId, programId, day) =>
      run((db) => {
        const m = machine(db, machineId),
          p = program(db, programId, m.id),
          s = space(db, m.spaceId),
          u = user(db);
        const base = time(`${day}T00:00:00+03:00`);
        if (!Number.isFinite(base)) throw new Error("Geçersiz tarih.");
        const slots: Slot[] = [];
        for (
          let h = s.rules.openHour * 60;
          h <= s.rules.closeHour * 60;
          h += 15
        ) {
          const a = base + minutes(h),
            b =
              a +
              minutes(
                p.durationMinutes +
                  s.rules.startGraceMinutes +
                  s.rules.pickupMinutes,
              );
          slots.push({
            startsAt: iso(a),
            endsAt: iso(b),
            available:
              a >= Date.now() &&
              a <= Date.now() + 86_400_000 &&
              inHours(s, a, b) &&
              !["out_of_order", "needs_check"].includes(m.status) &&
              !hasRight(db, s.id, u.id) &&
              quota(db, s, u.id, a) &&
              !db.reservations.some(
                (r) =>
                  r.machineId === m.id &&
                  live(r) &&
                  overlap(a, b, time(r.startsAt), time(r.endsAt)),
              ),
          });
        }
        return slots;
      }),
    reserve: (machineId, programId, startsAt) =>
      run((db) => {
        const m = machine(db, machineId),
          p = program(db, programId, m.id),
          s = space(db, m.spaceId),
          u = user(db);
        const a = time(startsAt),
          b =
            a +
            minutes(
              p.durationMinutes +
                s.rules.startGraceMinutes +
                s.rules.pickupMinutes,
            );
        if (
          !Number.isFinite(a) ||
          a < Date.now() - 5000 ||
          a > Date.now() + 86_400_000
        )
          throw new Error("Rezervasyon gelecek 24 saat içinde olmalıdır.");
        if (hasRight(db, s.id, u.id))
          throw new Error(
            "Bu alanda zaten aktif bir kullanım hakkınız veya sıranız var.",
          );
        if (!quota(db, s, u.id, a))
          throw new Error(
            "Günlük veya yoğun saat kullanım sınırına ulaştınız.",
          );
        if (
          !inHours(s, a, b) ||
          ["out_of_order", "needs_check"].includes(m.status)
        )
          throw new Error("Makine veya saat kullanıma uygun değil.");
        if (
          db.reservations.some(
            (r) =>
              r.machineId === m.id &&
              live(r) &&
              overlap(a, b, time(r.startsAt), time(r.endsAt)),
          )
        )
          throw new Error("Bu saat başka bir kullanıcı tarafından alındı.");
        const rid = id();
        db.reservations.push({
          id: rid,
          spaceId: s.id,
          userId: u.id,
          userName: u.name,
          machineId: m.id,
          programId: p.id,
          startsAt: iso(a),
          endsAt: iso(b),
          status: "confirmed",
          startedAt: null,
          estimatedEndAt: null,
        });
        db.deadlines[rid] = iso(a + minutes(s.rules.startGraceMinutes));
        return rid;
      }),
    cancelReservation: (reservationId) =>
      run((db) => {
        const r = reservation(db, reservationId, true);
        if (!["offered", "confirmed"].includes(r.status))
          throw new Error("Başlayan kullanım iptal edilemez.");
        r.status = "cancelled";
        db.offers
          .filter((o) => o.reservationId === r.id && o.status === "pending")
          .forEach((o) => (o.status = "declined"));
        db.waitlist
          .filter(
            (w) =>
              w.userId === r.userId &&
              w.spaceId === r.spaceId &&
              w.status === "offered",
          )
          .forEach((w) => (w.status = "cancelled"));
      }),
    startUsage: (reservationId, machineQr) =>
      run((db) => {
        const r = reservation(db, reservationId),
          m = machine(db, r.machineId),
          p = program(db, r.programId),
          s = space(db, r.spaceId);
        if (r.status !== "confirmed")
          throw new Error("Rezervasyon başlatılabilir durumda değil.");
        if (machineQr.trim() !== m.qrToken)
          throw new Error("QR kodu bu makineye ait değil.");
        if (m.status !== "available" || db.current[m.id])
          throw new Error("Makine henüz fiziksel olarak boş değil.");
        const now = Date.now();
        if (now < time(r.startsAt) || now > time(db.deadlines[r.id]))
          throw new Error(
            "Başlangıç zamanı henüz gelmedi veya tolerans süresi geçti.",
          );
        if (
          now + minutes(p.durationMinutes + s.rules.pickupMinutes) >
          time(r.endsAt)
        )
          throw new Error(
            "Gecikme nedeniyle program sonraki rezervasyona sığmıyor.",
          );
        r.status = "running";
        r.startedAt = iso(now);
        r.estimatedEndAt = iso(now + minutes(p.durationMinutes));
        m.status = "running";
        m.estimatedEndAt = r.estimatedEndAt;
        db.current[m.id] = r.id;
      }),
    finishUsage: (reservationId) =>
      run((db) => {
        const r = reservation(db, reservationId, true),
          m = machine(db, r.machineId);
        if (r.status !== "running" || db.current[m.id] !== r.id)
          throw new Error("Bu kullanım makinenin aktif kullanımı değil.");
        r.status = "completed";
        m.status = "available";
        m.estimatedEndAt = null;
        delete db.current[m.id];
        const s = space(db, r.spaceId);
        db.reservations
          .filter(
            (rr) =>
              rr.machineId === m.id &&
              rr.status === "confirmed" &&
              time(rr.startsAt) <= Date.now(),
          )
          .forEach(
            (rr) =>
              (db.deadlines[rr.id] = iso(
                Date.now() + minutes(s.rules.startGraceMinutes),
              )),
          );
      }),
    joinWaitlist: (spaceId, programId, availableUntil) =>
      run((db) => {
        const s = space(db, spaceId),
          u = user(db),
          p = program(db, programId),
          m = machine(db, p.machineId);
        if (
          m.spaceId !== s.id ||
          ["out_of_order", "needs_check"].includes(m.status)
        )
          throw new Error("Program bu alanda kullanılabilir değil.");
        if (hasRight(db, s.id, u.id))
          throw new Error(
            "Bu alanda zaten aktif bir kullanım hakkınız veya sıranız var.",
          );
        if (
          time(availableUntil) <= Date.now() ||
          time(availableUntil) > Date.now() + 86_400_000
        )
          throw new Error("Uygunluk süreniz gelecek 24 saat içinde olmalıdır.");
        db.waitlist.push({
          id: id(),
          spaceId: s.id,
          userId: u.id,
          programId: p.id,
          createdAt: iso(),
          availableUntil,
          status: "waiting",
        });
      }),
    leaveWaitlist: (entryId) =>
      run((db) => {
        const w = db.waitlist.find((w) => w.id === entryId);
        if (!w || w.userId !== user(db).id)
          throw new Error("Bu sıra size ait değil.");
        space(db, w.spaceId);
        w.status = "cancelled";
        db.offers
          .filter(
            (o) =>
              o.spaceId === w.spaceId &&
              o.userId === w.userId &&
              o.status === "pending",
          )
          .forEach((o) => {
            o.status = "declined";
            const r = db.reservations.find((r) => r.id === o.reservationId);
            if (r) r.status = "cancelled";
          });
      }),
    acceptOffer: (offerId) =>
      run((db) => {
        const o = db.offers.find((o) => o.id === offerId);
        if (!o || o.userId !== user(db).id)
          throw new Error("Bu teklif size ait değil.");
        const s = space(db, o.spaceId),
          m = machine(db, o.machineId),
          r = reservation(db, o.reservationId);
        if (
          o.status !== "pending" ||
          time(o.expiresAt) <= Date.now() ||
          r.status !== "offered"
        )
          throw new Error("Teklif süresi dolmuş veya işleme alınmış.");
        if (
          m.status !== "available" ||
          !quota(db, s, o.userId, Date.now(), r.id)
        )
          throw new Error("Makine veya kullanım sınırınız uygun değil.");
        o.status = "accepted";
        r.status = "confirmed";
        r.startsAt = iso();
        db.deadlines[r.id] = iso(Date.now() + minutes(s.rules.arrivalMinutes));
        db.waitlist
          .filter(
            (w) =>
              w.spaceId === s.id &&
              w.userId === o.userId &&
              w.status === "offered",
          )
          .forEach((w) => (w.status = "accepted"));
      }),
    declineOffer: (offerId) =>
      run((db) => {
        const o = db.offers.find((o) => o.id === offerId);
        if (!o || o.userId !== user(db).id)
          throw new Error("Bu teklif size ait değil.");
        space(db, o.spaceId);
        if (o.status !== "pending" || time(o.expiresAt) <= Date.now())
          throw new Error("Teklif artık aktif değil.");
        o.status = "declined";
        const r = db.reservations.find((r) => r.id === o.reservationId);
        if (r) r.status = "cancelled";
        db.waitlist
          .filter(
            (w) =>
              w.spaceId === o.spaceId &&
              w.userId === o.userId &&
              w.status === "offered",
          )
          .forEach((w) => (w.status = "cancelled"));
      }),
    refreshTimers: () =>
      run((db) => {
        user(db);
      }),
    subscribe(listener) {
      listeners.add(listener);
      const interval = setInterval(listener, 30_000);
      return () => {
        listeners.delete(listener);
        clearInterval(interval);
      };
    },
  };
}
function revokeFuture(db: DemoState, mm: Membership) {
  db.reservations
    .filter(
      (r) =>
        r.spaceId === mm.spaceId &&
        r.userId === mm.userId &&
        ["offered", "confirmed"].includes(r.status),
    )
    .forEach((r) => (r.status = "cancelled"));
  db.offers
    .filter(
      (o) =>
        o.spaceId === mm.spaceId &&
        o.userId === mm.userId &&
        o.status === "pending",
    )
    .forEach((o) => (o.status = "declined"));
  db.waitlist
    .filter(
      (w) =>
        w.spaceId === mm.spaceId &&
        w.userId === mm.userId &&
        ["waiting", "offered"].includes(w.status),
    )
    .forEach((w) => (w.status = "cancelled"));
}
