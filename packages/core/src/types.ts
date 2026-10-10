export type MembershipStatus =
  "pending" | "active" | "rejected" | "removed" | "blocked";
export type MemberRole = "owner" | "admin" | "member";
export type MachineType = "washer" | "dryer";
export type MachineStatus =
  "available" | "running" | "awaiting_pickup" | "out_of_order" | "needs_check";
export type ReservationStatus =
  "offered" | "confirmed" | "running" | "completed" | "cancelled" | "no_show";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}
export interface SpaceRules {
  openHour: number;
  closeHour: number;
  peakStartHour: number;
  peakEndHour: number;
  dailyLimit: number;
  peakDailyLimit: number;
  startGraceMinutes: number;
  pickupMinutes: number;
  offerMinutes: number;
  arrivalMinutes: number;
}
export interface Space {
  id: string;
  name: string;
  kind: string;
  ownerId: string;
  timezone: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  rules: SpaceRules;
}
export interface Membership {
  id: string;
  spaceId: string;
  userId: string;
  name: string;
  email: string;
  room: string;
  role: MemberRole;
  status: MembershipStatus;
  createdAt: string;
}
export interface Machine {
  id: string;
  spaceId: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  qrToken: string;
  estimatedEndAt: string | null;
}
export interface Program {
  id: string;
  machineId: string;
  name: string;
  durationMinutes: number;
}
export interface Reservation {
  id: string;
  spaceId: string;
  userId: string;
  userName: string;
  machineId: string;
  programId: string;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  startedAt: string | null;
  estimatedEndAt: string | null;
}
export interface WaitlistEntry {
  id: string;
  spaceId: string;
  userId: string;
  programId: string;
  createdAt: string;
  availableUntil: string;
  status: "waiting" | "offered" | "accepted" | "cancelled";
}
export interface Offer {
  id: string;
  spaceId: string;
  userId: string;
  machineId: string;
  programId: string;
  reservationId: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "declined";
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}
export interface MachineWatch {
  machineId: string;
  spaceId: string;
  expiresAt: string;
}
export interface Snapshot {
  profile: UserProfile;
  spaces: Space[];
  memberships: Membership[];
  machines: Machine[];
  programs: Program[];
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  offers: Offer[];
  notifications: Notification[];
  watches: MachineWatch[];
}
export interface InvitePreview {
  spaceId: string;
  spaceName: string;
  expiresAt: string;
}
export interface Slot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}
export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}
export interface LaundryClient {
  readonly mode: "supabase" | "demo";
  getSession(): Promise<UserProfile | null>;
  signIn(email: string, password: string): Promise<UserProfile>;
  signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<{ user: UserProfile | null; needsVerification: boolean }>;
  signOut(): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  createSpace(name: string, kind: string): Promise<string>;
  previewInvite(code: string): Promise<InvitePreview>;
  requestMembership(code: string, room: string): Promise<void>;
  approveMember(membershipId: string, verified: boolean): Promise<void>;
  rejectMember(membershipId: string, reason: string): Promise<void>;
  blockMember(membershipId: string): Promise<void>;
  createInvite(spaceId: string): Promise<{ code: string; expiresAt: string }>;
  saveRules(spaceId: string, rules: SpaceRules): Promise<void>;
  addMachine(
    spaceId: string,
    name: string,
    programs: Array<{ name: string; durationMinutes: number }>,
    type?: MachineType,
  ): Promise<void>;
  setMachineStatus(machineId: string, status: MachineStatus): Promise<void>;
  addProgram(
    machineId: string,
    name: string,
    durationMinutes: number,
  ): Promise<void>;
  resolveMachine(
    machineQr: string,
  ): Promise<{ machineId: string; spaceId: string }>;
  startWalkIn(machineQr: string, programId: string): Promise<string>;
  watchMachine(machineId: string, enabled: boolean): Promise<void>;
  getAvailability(
    machineId: string,
    programId: string,
    day: string,
  ): Promise<Slot[]>;
  reserve(
    machineId: string,
    programId: string,
    startsAt: string,
  ): Promise<string>;
  cancelReservation(reservationId: string): Promise<void>;
  startUsage(reservationId: string, machineQr: string): Promise<void>;
  finishUsage(reservationId: string): Promise<void>;
  joinWaitlist(
    spaceId: string,
    programId: string,
    availableUntil: string,
  ): Promise<void>;
  leaveWaitlist(entryId: string): Promise<void>;
  acceptOffer(offerId: string): Promise<void>;
  declineOffer(offerId: string): Promise<void>;
  refreshTimers(): Promise<void>;
  subscribe(listener: () => void): () => void;
}
