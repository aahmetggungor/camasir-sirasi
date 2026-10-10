"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ListOrdered,
  QrCode,
} from "lucide-react";
import type { Reservation, Space } from "@camasir/core";
import { useLaundry } from "@/lib/laundry";
import {
  Button,
  EmptyState,
  Field,
  Modal,
  StatusBadge,
  dateTime,
  time,
} from "./ui";

export function ReservationsPage({ space }: { space: Space }) {
  const { snapshot, profile, busy, run } = useLaundry();
  const [starting, setStarting] = useState<Reservation | null>(null);
  const [finishing, setFinishing] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [filter, setFilter] = useState("active");
  const admin = space.role !== "member";
  const all =
    snapshot?.reservations.filter((r) => r.spaceId === space.id) ?? [];
  const reservations = all
    .filter(
      (r) =>
        filter === "all" ||
        ["confirmed", "running", "offered"].includes(r.status),
    )
    .sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  const offers =
    snapshot?.offers.filter(
      (o) =>
        o.spaceId === space.id &&
        o.userId === profile?.id &&
        o.status === "pending",
    ) ?? [];
  const waitlist =
    snapshot?.waitlist.filter(
      (w) =>
        w.spaceId === space.id &&
        w.userId === profile?.id &&
        ["waiting", "offered"].includes(w.status),
    ) ?? [];
  const machineName = (id: string) => {
    const machine = snapshot?.machines.find((m) => m.id === id);
    return machine
      ? `${machine.type === "dryer" ? "Kurutma" : "Çamaşır"} · ${machine.name}`
      : "Makine";
  };
  const programName = (id: string) =>
    snapshot?.programs.find((p) => p.id === id)?.name ?? "Program";
  async function finish() {
    if (!finishing) return;
    const result = await run(
      "Teslim onaylanıyor",
      async (c) => {
        await c.finishUsage(finishing.id);
        return true;
      },
      "Çamaşırlar teslim alındı. Makine bir sonraki kullanım için hazır.",
    );
    if (result) setFinishing(null);
  }
  async function cancel() {
    if (!cancelling) return;
    const result = await run(
      "Rezervasyon iptal ediliyor",
      async (c) => {
        await c.cancelReservation(cancelling.id);
        return true;
      },
      "Rezervasyon iptal edildi. Boşalan yer bekleyen kişiler için değerlendirilecek.",
    );
    if (result) setCancelling(null);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">SIRA TAKİBİ</span>
          <h1>Rezervasyonlar</h1>
          <p>
            {admin
              ? "Çamaşır ve kurutma rezervasyonlarını takip et."
              : "Kullanımını, rezervasyonunu ve sıranı takip et."}
          </p>
        </div>
        <span className="outline-pill">
          <CalendarDays size={16} />{" "}
          {
            all.filter((r) => ["confirmed", "running"].includes(r.status))
              .length
          }{" "}
          aktif rezervasyon
        </span>
      </div>
      {offers.map((offer) => (
        <div className="offer-card" key={offer.id}>
          <div className="offer-icon">
            <Clock3 size={25} />
          </div>
          <div>
            <span className="section-kicker">SANA YER AÇILDI</span>
            <h3>{machineName(offer.machineId)} için teklifin var</h3>
            <p>
              {programName(offer.programId)} · {dateTime(offer.expiresAt)}{" "}
              tarihine kadar kabul et.
            </p>
          </div>
          <div className="offer-actions">
            <Button
              disabled={!!busy}
              onClick={() => {
                void run(
                  "Teklif kabul ediliyor",
                  async (c) => {
                    await c.acceptOffer(offer.id);
                    return true;
                  },
                  "Teklifi kabul ettin. Rezervasyonundaki süre içinde makineye gel.",
                );
              }}
            >
              <Check size={17} /> Kabul et
            </Button>
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                void run(
                  "Teklif reddediliyor",
                  async (c) => {
                    await c.declineOffer(offer.id);
                    return true;
                  },
                  "Teklif sonraki uygun kişiye bırakıldı.",
                );
              }}
            >
              Bu kez geç
            </Button>
          </div>
        </div>
      ))}
      {waitlist.length > 0 && (
        <div className="panel waitlist-panel">
          <div className="section-heading">
            <h2>
              <ListOrdered size={19} /> Bekleme sıran
            </h2>
            <span className="muted small">
              Uygun boşluk oluşunca teklif gelir
            </span>
          </div>
          {waitlist.map((entry) => (
            <div className="waitlist-row" key={entry.id}>
              <div>
                <strong>{programName(entry.programId)}</strong>
                <span>
                  {dateTime(entry.availableUntil)} tarihine kadar uygunsun
                </span>
              </div>
              <StatusBadge status={entry.status} />
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => {
                  void run(
                    "Sıradan çıkılıyor",
                    async (c) => {
                      await c.leaveWaitlist(entry.id);
                      return true;
                    },
                    "Bekleme sırasından çıktın.",
                  );
                }}
              >
                Sıradan çık
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="panel">
        <div className="panel-header">
          <h2>{admin ? "Alan rezervasyonları" : "Rezervasyonlarım"}</h2>
          <div className="segmented">
            <button
              onClick={() => setFilter("active")}
              className={filter === "active" ? "selected" : ""}
            >
              Aktif
            </button>
            <button
              onClick={() => setFilter("all")}
              className={filter === "all" ? "selected" : ""}
            >
              Tümü
            </button>
          </div>
        </div>
        {reservations.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={30} />}
            title="Şimdilik rezervasyon yok"
            text="Çamaşır veya kurutma bölümünden programını ve uygun saatini seçebilirsin."
          >
            <a className="button button-secondary" href="#washers">
              Çamaşır <ArrowRight size={16} />
            </a>
            <a className="button button-secondary" href="#dryers">
              Kurutma <ArrowRight size={16} />
            </a>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Makine / program</th>
                  {admin && <th>Üye</th>}
                  <th>Rezervasyon zamanı</th>
                  <th>Durum</th>
                  <th className="text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => {
                  const own = reservation.userId === profile?.id;
                  return (
                    <tr key={reservation.id}>
                      <td>
                        <strong>{machineName(reservation.machineId)}</strong>
                        <span className="table-subtext">
                          {programName(reservation.programId)}
                        </span>
                      </td>
                      {admin && (
                        <td>
                          <strong>{reservation.userName}</strong>
                          {own && (
                            <span className="table-subtext">
                              Senin rezervasyonun
                            </span>
                          )}
                        </td>
                      )}
                      <td>
                        <strong>{dateTime(reservation.startsAt)}</strong>
                        <span className="table-subtext">
                          {reservation.estimatedEndAt
                            ? `Tahmini bitiş ${time(reservation.estimatedEndAt)}`
                            : `Ayrılan blok ${time(reservation.endsAt)} saatine kadar`}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={reservation.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {own && reservation.status === "confirmed" && (
                            <Button
                              variant="secondary"
                              disabled={!!busy}
                              onClick={() => setStarting(reservation)}
                            >
                              <QrCode size={15} /> Başlat
                            </Button>
                          )}
                          {(own || admin) &&
                            reservation.status === "running" && (
                              <Button
                                variant="secondary"
                                disabled={!!busy}
                                onClick={() => setFinishing(reservation)}
                              >
                                <Check size={15} /> Teslim alındı
                              </Button>
                            )}
                          {(own || admin) &&
                            reservation.status === "confirmed" && (
                              <Button
                                variant="ghost"
                                disabled={!!busy}
                                onClick={() => setCancelling(reservation)}
                              >
                                İptal et
                              </Button>
                            )}
                          {!["confirmed", "running"].includes(
                            reservation.status,
                          ) && <span className="muted">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="quiet-note">
        <Clock3 size={19} />
        <p>
          <strong>Süreler sunucuda kontrol edilir.</strong> Başlatma toleransı{" "}
          {space.rules.startGraceMinutes} dakika, çamaşırları alma tamponu{" "}
          {space.rules.pickupMinutes} dakika. Önceki kullanım bitmeden makine
          yeniden atanmaz.
        </p>
      </div>
      {starting && (
        <Modal
          title="Kullanımı başlat"
          description={`${machineName(starting.machineId)} · Makinenin yanındaki kodu doğrula.`}
          onClose={() => setStarting(null)}
        >
          <StartUsageForm
            reservation={starting}
            onDone={() => setStarting(null)}
          />
        </Modal>
      )}
      {finishing && (
        <Modal
          title="Çamaşırlar teslim alındı mı?"
          description={`${machineName(finishing.machineId)} makinesini boş olarak işaretleyeceksin.`}
          onClose={() => setFinishing(null)}
        >
          <p className="confirmation-text">
            Çamaşırların tamamen çıkarıldığından ve makinenin bir sonraki kişiye
            hazır olduğundan emin ol.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setFinishing(null)}>
              Geri dön
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => {
                void finish();
              }}
            >
              {busy ?? "Makine boş, onayla"}
            </Button>
          </div>
        </Modal>
      )}
      {cancelling && (
        <Modal
          title="Rezervasyonu iptal et"
          description={`${machineName(cancelling.machineId)} · ${dateTime(cancelling.startsAt)}`}
          onClose={() => setCancelling(null)}
        >
          <p className="confirmation-text">
            Bu kullanım hakkını bırakacaksın. Boşalan yer bekleme sırasına
            teklif edilebilir.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() => {
                void cancel();
              }}
            >
              {busy ?? "Rezervasyonu iptal et"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function StartUsageForm({
  reservation,
  onDone,
}: {
  reservation: Reservation;
  onDone: () => void;
}) {
  const { snapshot, client, busy, run } = useLaundry();
  const [qr, setQr] = useState("");
  const [ready, setReady] = useState(false);
  const machine = snapshot?.machines.find(
    (m) => m.id === reservation.machineId,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run(
      "Kullanım başlatılıyor",
      async (c) => {
        await c.startUsage(reservation.id, qr.trim());
        return true;
      },
      "Kullanım başladı. Makinenin fiziksel panelinden seçtiğin programı çalıştır.",
    );
    if (result) onDone();
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field
        label="Makine kodu"
        hint="Mobil uygulamada QR okuyabilir, webde makine üzerindeki kodu girebilirsin."
      >
        <input
          value={qr}
          onChange={(event) => setQr(event.target.value)}
          placeholder="Makinenin kodunu gir"
          required
          autoComplete="off"
        />
      </Field>
      {client?.mode === "demo" && machine?.qrToken && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setQr(machine.qrToken)}
        >
          Sunum: örnek makine kodunu doldur
        </Button>
      )}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={ready}
          onChange={(event) => setReady(event.target.checked)}
          required
        />
        <span>
          Makinenin yanındayım, çamaşırlarımı yerleştirdim ve programı fiziksel
          panelden çalıştıracağım.
        </span>
      </label>
      <Button type="submit" disabled={!!busy || !ready}>
        {busy ?? "Kullanımı başlat"}
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
