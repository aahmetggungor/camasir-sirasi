import type { SpaceRules } from "./types";
export const DEFAULT_RULES: SpaceRules = {
  openHour: 7,
  closeHour: 23,
  peakStartHour: 18,
  peakEndHour: 22,
  dailyLimit: 2,
  peakDailyLimit: 1,
  startGraceMinutes: 5,
  pickupMinutes: 10,
  offerMinutes: 2,
  arrivalMinutes: 5,
};
export function validateRules(r: SpaceRules): void {
  const bounded = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  if (
    !bounded(r.openHour, 0, 23) ||
    !bounded(r.closeHour, 1, 24) ||
    r.openHour >= r.closeHour ||
    !bounded(r.peakStartHour, 0, 23) ||
    !bounded(r.peakEndHour, 1, 24) ||
    r.peakStartHour >= r.peakEndHour ||
    !bounded(r.dailyLimit, 1, 10) ||
    !bounded(r.peakDailyLimit, 1, 10) ||
    r.peakDailyLimit > r.dailyLimit ||
    !bounded(r.startGraceMinutes, 1, 30) ||
    !bounded(r.pickupMinutes, 1, 60) ||
    !bounded(r.offerMinutes, 1, 10) ||
    !bounded(r.arrivalMinutes, 1, 30)
  ) {
    throw new Error("Çalışma saatlerini ve kullanım sınırlarını kontrol edin.");
  }
}
