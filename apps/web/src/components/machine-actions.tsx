"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  machineCode,
  type Machine,
  type MachineType,
  type Space,
} from "@camasir/core";
import { useLaundry } from "@/lib/laundry";
import { Button, Field, time } from "./ui";

export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
export function QuickUsageForm({
  onDone,
}: {
  onDone: (type: MachineType) => void;
}) {
  const { snapshot, busy, run } = useLaundry();
  const [qr, setQr] = useState("");
  const [machineId, setMachineId] = useState("");
  const [programId, setProgramId] = useState("");
  const [ready, setReady] = useState(false);
  const now = useClock();
  const machine = snapshot?.machines.find((m) => m.id === machineId);
  const programs =
    snapshot?.programs.filter((p) => p.machineId === machineId) ?? [];
  const program = programs.find((p) => p.id === programId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!machine) {
      const result = await run("Makine bulunuyor", (c) => c.resolveMachine(qr));
      if (result) {
        setMachineId(result.machineId);
        const own = snapshot?.reservations.find(
          (r) =>
            r.userId === snapshot.profile.id &&
            r.machineId === result.machineId &&
            r.status === "confirmed",
        );
        setProgramId(
          own?.programId ??
            snapshot?.programs.find((p) => p.machineId === result.machineId)
              ?.id ??
            "",
        );
      }
      return;
    }
    const result = await run(
      "Kullanım başlatılıyor",
      (c) => c.startWalkIn(qr, programId),
      "Kullanım başladı. Geri sayımını takip edebilirsin.",
    );
    if (result) onDone(machine.type);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {!machine ? (
        <Field
          label="Makine kodu / QR bağlantısı"
          hint="Telefonda üst menüdeki QR düğmesini kullan. Webde etiketteki kodu gir."
        >
          <input
            required
            autoComplete="off"
            value={qr}
            onChange={(e) => setQr(e.target.value)}
          />
        </Field>
      ) : (
        <>
          <h3>{machine.name}</h3>
          <span
            className={`machine-type-tag ${machine.type === "dryer" ? "dryer-type-tag" : ""}`}
          >
            {machine.type === "dryer" ? "Kurutma makinesi" : "Çamaşır makinesi"}
          </span>
          <Field label="Program kısayolları">
            <select
              value={programId}
              onChange={(e) => {
                setProgramId(e.target.value);
                setReady(false);
              }}
              required
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.durationMinutes} dk
                </option>
              ))}
            </select>
          </Field>
          {program && (
            <div className="inline-info">
              {program.durationMinutes} dk · Şimdi başlarsa tahmini bitiş{" "}
              {time(
                new Date(now + program.durationMinutes * 60_000).toISOString(),
              )}
            </div>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={ready}
              onChange={(e) => setReady(e.target.checked)}
            />
            Makine boştu; çamaşırlarımı koydum ve seçtiğim programı makine
            panelinden başlattım.
          </label>
          {machine.status !== "available" && (
            <p className="field-error">
              Makine henüz fiziksel olarak boş değil.
            </p>
          )}
          <p className="muted small">
            Alan başına tek aktif hak. Mevcut rezervasyonlar, sıra ve çalışma
            saatleri sunucuda kontrol edilir.
          </p>
        </>
      )}
      <Button
        disabled={
          !!busy ||
          (!machine && !machineCode(qr)) ||
          (!!machine &&
            (!ready || !programId || machine.status !== "available"))
        }
      >
        {busy ?? (machine ? "Kullanımı başlat" : "Makineyi bul")}
      </Button>
    </form>
  );
}
export function AddProgramForm({
  machine,
  onDone,
}: {
  machine: Machine;
  onDone: () => void;
}) {
  const { snapshot, busy, run } = useLaundry();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(30);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          "Program ekleniyor",
          async (c) => {
            await c.addProgram(machine.id, name, minutes);
            return true;
          },
          "Program kısayolu eklendi.",
        );
        if (ok) onDone();
      }}
    >
      <div className="inline-info">
        {snapshot?.programs
          .filter((p) => p.machineId === machine.id)
          .map((p) => `${p.name} · ${p.durationMinutes} dk`)
          .join(" / ")}
      </div>
      <Field label="Program adı">
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pamuklu 40°"
        />
      </Field>
      <Field label="Süre (dakika)">
        <input
          type="number"
          required
          min={10}
          max={240}
          step={1}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </Field>
      <p className="muted small">
        Kayıtlı rezervasyonların süresi korunur. Yeni program, sonraki
        kullanımlar için kısayol olarak eklenir.
      </p>
      <Button disabled={!!busy}>{busy ?? "Program ekle"}</Button>
    </form>
  );
}
export function MachineWaitForm({
  machine,
  space,
  onDone,
}: {
  machine: Machine;
  space: Space;
  onDone: () => void;
}) {
  const { snapshot, busy, run } = useLaundry();
  const programs =
    snapshot?.programs.filter((p) => p.machineId === machine.id) ?? [];
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [hours, setHours] = useState(2);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          "Sıraya katılınıyor",
          async (c) => {
            await c.joinWaitlist(
              space.id,
              programId,
              new Date(Date.now() + hours * 3600_000).toISOString(),
            );
            return true;
          },
          "Sıra isteğin kaydedildi. Uygun boşlukta süreli teklif gelecek.",
        );
        if (ok) onDone();
      }}
    >
      <Field label="Program">
        <select
          required
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.durationMinutes} dk
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kaç saat daha gelebilirsin?">
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[1, 2, 4, 8].map((h) => (
            <option key={h} value={h}>
              {h} saat
            </option>
          ))}
        </select>
      </Field>
      <div className="inline-info">
        Bu istek bir makine için tek sıra hakkı tutar. Boşluk seçtiğin programa
        sığarsa süreli teklif alırsın; kabul etmeden kullanım başlamaz.
      </div>
      <Button disabled={!!busy || !programId}>{busy ?? "Sıra iste"}</Button>
    </form>
  );
}
