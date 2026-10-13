import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useClock() {
  // Bu saat ekranı yeniler; program süresini veya veritabanı kaydını değiştirmez.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setNow(Date.now());
    }, 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}
