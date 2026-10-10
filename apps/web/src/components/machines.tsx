"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Plus,
  QrCode,
  Settings2,
  WashingMachine,
  Wind,
  X,
} from "lucide-react";
import type { Machine, MachineType, Program, Slot, Space } from "@camasir/core";
import { activeMachines, countdown, machineLink } from "@camasir/core";
import {
  AddProgramForm,
  MachineWaitForm,
  QuickUsageForm,
  useClock,
} from "./machine-actions";
import { useLaundry } from "@/lib/laundry";
import {
  Button,
  EmptyState,
  Field,
  Modal,
  Spinner,
  StatusBadge,
  dateTime,
  localDay,
  time,
} from "./ui";
import { QrLabel } from "./qr-label";

export function MachinesPage({
  space,
  machineType,
}: {
  space: Space;
  machineType: MachineType;
}) {
  const dryer = machineType === "dryer";
  const category = dryer ? "Kurutma makineleri" : "Çamaşır makineleri";
  const single = dryer ? "Kurutma makinesi" : "Çamaşır makinesi";
  const DeviceIcon = dryer ? Wind : WashingMachine;
  const { snapshot, busy, client, run } = useLaundry();
  const [add, setAdd] = useState(false);
  const [booking, setBooking] = useState<Machine | null>(null);
  const [codeMachine, setCodeMachine] = useState<Machine | null>(null);
  const [programMachine, setProgramMachine] = useState<Machine | null>(null);
  const [waiting, setWaiting] = useState<Machine | null>(null);
  const [quick, setQuick] = useState(false);
  const now = useClock();
  const machines =
    snapshot?.machines.filter(
      (item) => item.spaceId === space.id && item.type === machineType,
    ) ?? [];
  const programs = snapshot?.programs ?? [];
  const using = activeMachines(machines, now);
  const hasRight =
    !!snapshot?.reservations.some(
      (r) =>
        r.spaceId === space.id &&
        r.userId === snapshot.profile.id &&
        ["offered", "confirmed", "running"].includes(r.status),
    ) ||
    !!snapshot?.waitlist.some(
      (w) =>
        w.spaceId === space.id &&
        w.userId === snapshot.profile.id &&
        ["waiting", "offered"].includes(w.status),
    );
  const admin = space.role !== "member";
  const available = machines.filter(
    (item) => item.status === "available",
  ).length;
  const running = machines.filter(
    (item) => item.status === "running" || item.status === "awaiting_pickup",
  ).length;
  const own = snapshot?.reservations.find(
    (item) =>
      item.spaceId === space.id &&
      item.userId === snapshot.profile.id &&
      ["confirmed", "running"].includes(item.status),
  );
  return (
    <div className={dryer ? "machine-page machine-page-dryer" : "machine-page"}>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ÇAMAŞIRHANE</span>
          <h1>{category}</h1>
          <p>
            {dryer
              ? "Kurutma programını seç, uygun saatini ayır."
              : "Yıkama programını seç, uygun saatini ayır."}
          </p>
        </div>
        <div className="machine-heading-actions">
          <Button variant="secondary" onClick={() => setQuick(true)}>
            <QrCode size={17} /> QR / Hızlı başlat
          </Button>
          {admin && (
            <Button onClick={() => setAdd(true)}>
              <Plus size={17} /> {single} ekle
            </Button>
          )}
        </div>
      </div>
      {using.length > 0 && (
        <section className="panel live-machines">
          <div className="panel-header">
            <h2>{dryer ? "Aktif kurutmalar" : "Aktif yıkamalar"}</h2>
            <span className="muted small">Kalan süre · çoktan aza</span>
          </div>
          {using.map((machine) => {
            const watched = snapshot?.watches.some(
              (w) => w.machineId === machine.id,
            );
            const current = snapshot?.reservations.find(
              (r) => r.machineId === machine.id && r.status === "running",
            );
            const program = programs.find((p) => p.id === current?.programId);
            return (
              <article className="live-machine-row" key={machine.id}>
                <DeviceIcon size={26} />
                <div className="live-machine-name">
                  <h3>{machine.name}</h3>
                  <p>
                    {program?.name} · Tahmini bitiş{" "}
                    {machine.estimatedEndAt
                      ? time(machine.estimatedEndAt)
                      : "—"}
                  </p>
                </div>
                <strong className="live-countdown">
                  {countdown(machine.estimatedEndAt, now)}
                </strong>
                <div className="live-machine-actions">
                  <Button
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        "Bildirim takibi güncelleniyor",
                        async (c) => {
                          await c.watchMachine(machine.id, !watched);
                          return true;
                        },
                        watched
                          ? "Takip kaldırıldı."
                          : "Teslim onaylanınca uygulama içi bildirim gelecek.",
                      )
                    }
                  >
                    {watched ? "Bildirimi kaldır" : "Boşalınca haber ver"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!!busy || hasRight}
                    onClick={() => setWaiting(machine)}
                  >
                    Sıra iste
                  </Button>
                </div>
              </article>
            );
          })}
          <p className="live-machine-note">
            Bildirim hakkı ayırmaz. Çamaşırlar alınınca teslim bildirimi gelir;
            sıra isteği ise uygun boşlukta süreli teklif verir.
          </p>
        </section>
      )}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon">
            <DeviceIcon size={21} />
          </span>
          <div>
            <span>{single} sayısı</span>
            <strong>{machines.length}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-green">
            <Clock3 size={21} />
          </span>
          <div>
            <span>Şu an müsait</span>
            <strong>
              {available}
              <small> makine</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-blue">
            <CalendarDays size={21} />
          </span>
          <div>
            <span>Kullanımda / teslim bekliyor</span>
            <strong>
              {running}
              <small> makine</small>
            </strong>
          </div>
        </div>
      </div>
      {own && (
        <div className="own-reservation-banner">
          <div>
            <CalendarDays size={22} />
            <div>
              <strong>
                {own.status === "running"
                  ? "Kullanımın sürüyor"
                  : "Sıradaki rezervasyonun"}
              </strong>
              <span>
                {snapshot?.machines.find((m) => m.id === own.machineId)?.name ??
                  "Makine"}{" "}
                · {dateTime(own.startsAt)}
                {own.estimatedEndAt
                  ? ` · Tahmini bitiş ${time(own.estimatedEndAt)}`
                  : ""}
              </span>
            </div>
          </div>
          <a href="#reservations">
            Rezervasyonlarım <ArrowRight size={16} />
          </a>
        </div>
      )}
      <div className="section-heading">
        <h2>
          {category} <span className="count">{machines.length}</span>
        </h2>
        <span className="live-label">
          <span /> Canlı durum
        </span>
      </div>
      {machines.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<DeviceIcon size={32} />}
            title={
              dryer
                ? "Henüz kurutma makinesi yok"
                : "Henüz çamaşır makinesi yok"
            }
            text={
              admin
                ? "Makine adını ve program sürelerini eklediğinde üyeler rezervasyon yapabilir."
                : "Yönetici henüz makine eklememiş. Makineler eklendiğinde burada görünecek."
            }
          >
            {admin && (
              <Button onClick={() => setAdd(true)}>
                <Plus size={17} /> {single} ekle
              </Button>
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="machine-grid">
          {machines.map((machine, index) => {
            const machinePrograms = programs.filter(
              (p) => p.machineId === machine.id,
            );
            return (
              <article
                className={`machine-card machine-${machine.status}`}
                key={machine.id}
              >
                <div className="machine-card-top">
                  <span className="machine-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <StatusBadge status={machine.status} />
                </div>
                <div className="machine-illustration">
                  <DeviceIcon size={64} strokeWidth={1.25} />
                </div>
                <h3>{machine.name}</h3>
                <span className="machine-type-tag">{single}</span>
                <p className="machine-description">
                  {machinePrograms.length} program ·{" "}
                  {machinePrograms
                    .map((p) => `${p.durationMinutes} dk`)
                    .join(" / ") || "Program eklenmedi"}
                </p>
                <div className="machine-time">
                  <Clock3 size={16} />
                  <span>
                    {machine.estimatedEndAt
                      ? `Tahmini bitiş ${time(machine.estimatedEndAt)}`
                      : machine.status === "available"
                        ? "Kullanıma hazır"
                        : machine.status === "out_of_order"
                          ? "Bakım tamamlanana kadar kapalı"
                          : machine.status === "awaiting_pickup"
                            ? "Çamaşırların alınması bekleniyor"
                            : "Yönetici kontrolü bekleniyor"}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  className="full-width"
                  onClick={() => setBooking(machine)}
                  disabled={
                    hasRight ||
                    machine.status === "out_of_order" ||
                    machine.status === "needs_check" ||
                    machinePrograms.length === 0
                  }
                >
                  <CalendarDays size={16} /> Müsait saatleri gör
                  <ArrowRight size={16} />
                </Button>
                {admin && (
                  <div className="machine-admin">
                    <button onClick={() => setCodeMachine(machine)}>
                      <QrCode size={15} /> Makine kodu
                    </button>
                    <button onClick={() => setProgramMachine(machine)}>
                      <Plus size={15} /> Program ekle
                    </button>
                    {["available", "out_of_order", "needs_check"].includes(
                      machine.status,
                    ) && (
                      <button
                        disabled={!!busy}
                        onClick={() => {
                          void run(
                            "Makine güncelleniyor",
                            async (c) => {
                              await c.setMachineStatus(
                                machine.id,
                                machine.status === "available"
                                  ? "out_of_order"
                                  : "available",
                              );
                              return true;
                            },
                            "Makine durumu güncellendi.",
                          );
                        }}
                      >
                        <Settings2 size={15} />
                        {machine.status === "available"
                          ? "Servise al"
                          : "Kullanıma aç"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="quiet-note">
        <QrCode size={19} />
        <p>
          <strong>Kullanım, makinenin yanında başlar.</strong> Rezervasyon
          sahibi makine kodunu doğrular, fiziksel panelden programı çalıştırır
          ve çamaşırlarını alınca teslimi onaylar.
        </p>
      </div>
      {add && (
        <Modal
          title={`Yeni ${single.toLocaleLowerCase("tr-TR")} ekle`}
          description="Üyelerin seçeceği programları ve gerçek sürelerini tanımla."
          onClose={() => setAdd(false)}
        >
          <AddMachineForm
            space={space}
            machineType={machineType}
            onDone={() => setAdd(false)}
          />
        </Modal>
      )}
      {quick && (
        <Modal
          title="QR ile hızlı kullanım"
          onClose={() => !busy && setQuick(false)}
        >
          <QuickUsageForm
            onDone={(type) => {
              setQuick(false);
              window.location.hash = type === "dryer" ? "dryers" : "washers";
            }}
          />
        </Modal>
      )}
      {programMachine && (
        <Modal
          title={`${programMachine.name} · Program ekle`}
          onClose={() => !busy && setProgramMachine(null)}
        >
          <AddProgramForm
            machine={programMachine}
            onDone={() => setProgramMachine(null)}
          />
        </Modal>
      )}
      {waiting && (
        <Modal
          title={`${waiting.name} · Sıra iste`}
          onClose={() => !busy && setWaiting(null)}
        >
          <MachineWaitForm
            machine={waiting}
            space={space}
            onDone={() => setWaiting(null)}
          />
        </Modal>
      )}
      {booking && (
        <Modal
          title={`${booking.name} · Rezervasyon`}
          description="Programını seç, uygun bir saat ayır."
          onClose={() => setBooking(null)}
        >
          <BookingForm
            machine={booking}
            programs={programs.filter((p) => p.machineId === booking.id)}
            space={space}
            onDone={() => setBooking(null)}
          />
        </Modal>
      )}
      {codeMachine && (
        <Modal
          title={`${codeMachine.name} · Makine kodu`}
          description="Bu kod yalnız bu makinede kullanım başlatmak içindir. Katılım daveti değildir."
          onClose={() => setCodeMachine(null)}
        >
          <div className="code-panel">
            <QrLabel
              value={machineLink(codeMachine.qrToken)}
              name={codeMachine.name}
            />
            <code>{codeMachine.qrToken}</code>
            <p>
              Makinenin yanına yerleştir. Üyeler mobilde QR okuyabilir veya bu
              kodu elle girebilir.
            </p>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(codeMachine.qrToken);
                } catch {
                  /* Code remains selectable if clipboard permission is unavailable. */
                }
              }}
            >
              Kodu kopyala
            </Button>
          </div>
          {client?.mode === "demo" && (
            <p className="muted small">
              Sunum kodu, bu tarayıcıdaki örnek makineye aittir.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function AddMachineForm({
  space,
  machineType,
  onDone,
}: {
  space: Space;
  machineType: MachineType;
  onDone: () => void;
}) {
  const { busy, run } = useLaundry();
  const [name, setName] = useState("");
  const [programs, setPrograms] = useState([
    {
      name: machineType === "dryer" ? "Hızlı kurutma" : "Hızlı yıkama",
      durationMinutes: 30,
    },
    {
      name: machineType === "dryer" ? "Dolap kuruluğu" : "Standart yıkama",
      durationMinutes: 60,
    },
  ]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run(
      "Makine ekleniyor",
      async (client) => {
        await client.addMachine(
          space.id,
          name.trim(),
          programs.map((p) => ({
            name: p.name.trim(),
            durationMinutes: p.durationMinutes,
          })),
          machineType,
        );
        return true;
      },
      "Makine ve programları eklendi.",
    );
    if (result) onDone();
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Makine adı">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            machineType === "dryer"
              ? "Örn. Kurutma makinesi 01"
              : "Örn. Çamaşır makinesi 01"
          }
          required
          maxLength={80}
        />
      </Field>
      <div className="section-heading">
        <h3>Programlar</h3>
        <Button
          variant="ghost"
          type="button"
          onClick={() =>
            setPrograms([...programs, { name: "", durationMinutes: 45 }])
          }
        >
          <Plus size={15} /> Program ekle
        </Button>
      </div>
      {programs.map((program, index) => (
        <div className="program-input-row" key={index}>
          <Field label={`Program ${index + 1}`}>
            <input
              aria-label={`Program ${index + 1} adı`}
              value={program.name}
              onChange={(event) =>
                setPrograms(
                  programs.map((p, i) =>
                    i === index ? { ...p, name: event.target.value } : p,
                  ),
                )
              }
              placeholder="Program adı"
              required
              maxLength={60}
            />
          </Field>
          <Field label="Süre (dk)">
            <input
              type="number"
              value={program.durationMinutes}
              min={10}
              max={240}
              required
              onChange={(event) =>
                setPrograms(
                  programs.map((p, i) =>
                    i === index
                      ? { ...p, durationMinutes: Number(event.target.value) }
                      : p,
                  ),
                )
              }
            />
          </Field>
          <button
            className="icon-button remove-program"
            type="button"
            disabled={programs.length === 1}
            aria-label={`Program ${index + 1} sil`}
            onClick={() => setPrograms(programs.filter((_, i) => i !== index))}
          >
            <X size={17} />
          </button>
        </div>
      ))}
      <Button type="submit" disabled={!!busy}>
        {busy ?? "Makineyi kaydet"}
      </Button>
    </form>
  );
}

function BookingForm({
  machine,
  programs,
  space,
  onDone,
}: {
  machine: Machine;
  programs: Program[];
  space: Space;
  onDone: () => void;
}) {
  const { client, busy, run, setNotice } = useLaundry();
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [day, setDay] = useState(localDay());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client || !programId) return;
    let alive = true;
    setLoading(true);
    setError("");
    setSelected("");
    void client
      .getAvailability(machine.id, programId, day)
      .then((result) => {
        if (alive) setSlots(result);
      })
      .catch((reason: unknown) => {
        if (alive)
          setError(
            reason instanceof Error ? reason.message : "Saatler yüklenemedi.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [client, machine.id, programId, day]);
  async function reserve(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setNotice({ kind: "error", text: "Önce uygun bir saat seç." });
      return;
    }
    const result = await run(
      "Rezervasyon yapılıyor",
      (c) => c.reserve(machine.id, programId, selected),
      "Rezervasyonun hazır. Saatinde makinenin yanında kullanımını başlat.",
    );
    if (result) onDone();
  }
  async function wait() {
    const until = new Date(
      `${day}T${String(space.rules.closeHour).padStart(2, "0")}:00:00+03:00`,
    ).toISOString();
    const result = await run(
      "Sıraya ekleniyor",
      async (c) => {
        await c.joinWaitlist(space.id, programId, until);
        return true;
      },
      "Bekleme sırasına katıldın. Uygun yer açılırsa süreli bir teklif alacaksın.",
    );
    if (result) onDone();
  }
  return (
    <form className="form-stack" onSubmit={reserve}>
      <div className="two-columns">
        <Field label="Yıkama programı">
          <select
            value={programId}
            onChange={(event) => setProgramId(event.target.value)}
          >
            {programs.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.durationMinutes} dk
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tarih">
          <input
            type="date"
            value={day}
            min={localDay()}
            onChange={(event) => setDay(event.target.value)}
            required
          />
        </Field>
      </div>
      <div>
        <div className="section-heading">
          <h3>Başlangıç saati</h3>
          <span className="muted small">Türkiye saati</span>
        </div>
        {loading ? (
          <Spinner text="Uygun saatler yükleniyor…" />
        ) : error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : slots.length === 0 ? (
          <div className="inline-empty">
            Bu gün için uygun zaman aralığı bulunamadı.
          </div>
        ) : (
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                type="button"
                key={slot.startsAt}
                disabled={!slot.available}
                className={`slot ${selected === slot.startsAt ? "selected" : ""}`}
                onClick={() => setSelected(slot.startsAt)}
                aria-pressed={selected === slot.startsAt}
              >
                {time(slot.startsAt)}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="inline-info">
        <Clock3 size={19} /> Program süresine başlangıç toleransı ve çamaşırları
        alma tamponu eklenir. Onaylı rezervasyonlar korunur.
      </p>
      <Button type="submit" disabled={!!busy || !selected || loading}>
        {busy ?? "Rezervasyonu onayla"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={!!busy || loading || !!error}
        onClick={() => {
          void wait();
        }}
      >
        Uygun yer açılınca teklif al
      </Button>
    </form>
  );
}
