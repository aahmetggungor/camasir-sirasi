import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Machine, MachineType, Slot, Space } from "@camasir/core";
import { activeMachines, countdown } from "@camasir/core";
import { useClock } from "../hooks/useClock";
import { WaitlistSheet } from "./QueueScreen";
import {
  Badge,
  Body,
  Button,
  Card,
  Chips,
  Empty,
  Heading,
  Label,
  Notice,
  Row,
  Sheet,
} from "../components/ui";
import { MachineVisual } from "../components/MachineVisual";
import type { LaundryState } from "../hooks/useLaundry";
import { client } from "../services/client";
import { dayIn, errorMessage, time } from "../services/format";
import { colors } from "../theme";

export const machineStatuses = {
  available: { label: "Boş", tone: "green" },
  running: { label: "Kullanımda", tone: "blue" },
  awaiting_pickup: { label: "Çamaşırlar alınacak", tone: "amber" },
  out_of_order: { label: "Arızalı", tone: "red" },
  needs_check: { label: "Kontrol gerekli", tone: "amber" },
} as const;

function BookingSheet({
  machine,
  space,
  state,
  onClose,
  onReserved,
}: {
  machine: Machine;
  space: Space;
  state: LaundryState;
  onClose: () => void;
  onReserved: () => void;
}) {
  const programs =
    state.snapshot?.programs.filter(
      (program) => program.machineId === machine.id,
    ) ?? [];
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const day = dayIn(space.timezone);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSelected("");
    setError("");
    if (!programId) {
      setLoading(false);
      return;
    }
    void client
      .getAvailability(machine.id, programId, day)
      .then((result) => {
        if (alive) setSlots(result.filter((slot) => slot.available));
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [machine.id, programId, day, attempt]);
  const selectedSlot = slots.find((slot) => slot.startsAt === selected);
  const program = programs.find((item) => item.id === programId);
  return (
    <Sheet
      title={machine.name}
      visible
      onClose={() => {
        if (!state.busy) onClose();
      }}
    >
      <Label>1. Programını seç</Label>
      {programs.length ? (
        <Chips
          values={programs.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.durationMinutes} dk`,
          }))}
          selected={programId}
          onSelect={setProgramId}
        />
      ) : (
        <Notice>
          Bu makine için henüz program eklenmemiş. Yöneticiye haber
          verebilirsin.
        </Notice>
      )}
      <Label>2. Bugün için başlangıç saati</Label>
      {loading ? (
        <ActivityIndicator color={colors.blue} style={{ padding: 24 }} />
      ) : error ? (
        <>
          <Notice error>{error}</Notice>
          <Button
            label="Saatleri yeniden yükle"
            secondary
            onPress={() => setAttempt(attempt + 1)}
          />
        </>
      ) : slots.length ? (
        <View style={s.slots}>
          {slots.map((slot) => (
            <Pressable
              key={slot.startsAt}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === slot.startsAt }}
              onPress={() => setSelected(slot.startsAt)}
              style={[s.slot, selected === slot.startsAt && s.selectedSlot]}
            >
              <Text
                style={[
                  s.slotText,
                  selected === slot.startsAt && { color: colors.blue },
                ]}
              >
                {time(slot.startsAt, space.timezone)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Empty
          icon="calendar-outline"
          title="Bugün uygun saat yok"
          text="Farklı bir makine seçebilir veya Sıram ekranından boşalan yere teklif almak için bekleme sırasına katılabilirsin."
        />
      )}
      {selectedSlot && (
        <Card>
          <Heading small>Rezervasyon özeti</Heading>
          <Row>
            <Body muted>Program</Body>
            <Body>{program?.name}</Body>
          </Row>
          <Row>
            <Body muted>Başlangıç</Body>
            <Body>{time(selectedSlot.startsAt, space.timezone)}</Body>
          </Row>
          <Row>
            <Body muted>Ayrılan blok</Body>
            <Body>
              {time(selectedSlot.startsAt, space.timezone)} –{" "}
              {time(selectedSlot.endsAt, space.timezone)}
            </Body>
          </Row>
          <Body muted>
            Program: {program?.durationMinutes} dk. Ayrılan blok, başlangıç
            toleransını ve çamaşırları alma süresini içerir.
          </Body>
        </Card>
      )}
      {!!state.error && <Notice error>{state.error}</Notice>}
      <Button
        label="Sıramı ayır"
        disabled={!selected || loading}
        busy={state.busy}
        onPress={() =>
          void state
            .act(
              () => client.reserve(machine.id, programId, selected),
              "Rezervasyonun hazır. Makinenin yanına geldiğinde kullanımını başlat.",
            )
            .then((ok) => {
              if (ok) {
                onClose();
                onReserved();
              }
            })
        }
      />
    </Sheet>
  );
}

export function MachinesScreen({
  state,
  space,
  machineType,
  onQueue,
}: {
  state: LaundryState;
  space: Space;
  onQueue: () => void;
  machineType: MachineType;
}) {
  const dryer = machineType === "dryer";
  const [booking, setBooking] = useState<Machine | null>(null);
  const [waiting, setWaiting] = useState<Machine | null>(null);
  const now = useClock();
  const machines =
    state.snapshot?.machines.filter(
      (machine) => machine.spaceId === space.id && machine.type === machineType,
    ) ?? [];
  const reservations =
    state.snapshot?.reservations.filter(
      (item) =>
        item.spaceId === space.id &&
        item.userId === state.profile?.id &&
        ["confirmed", "running"].includes(item.status),
    ) ?? [];
  const free = machines.filter(
    (machine) => machine.status === "available",
  ).length;
  const using = activeMachines(machines, now);
  const hasRight =
    !!state.snapshot?.reservations.some(
      (r) =>
        r.spaceId === space.id &&
        r.userId === state.profile?.id &&
        ["offered", "confirmed", "running"].includes(r.status),
    ) ||
    !!state.snapshot?.waitlist.some(
      (w) =>
        w.spaceId === space.id &&
        w.userId === state.profile?.id &&
        ["waiting", "offered"].includes(w.status),
    );
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 7 }}>
        <Heading>{dryer ? "Kurutma makineleri" : "Çamaşır makineleri"}</Heading>
        <Body muted>
          {dryer
            ? "Kurutma programını seç, uygun saatini ayır."
            : "Yıkama programını seç, uygun saatini ayır."}
        </Body>
      </View>
      <Row>
        <Badge text={`${free} boş makine`} tone="green" />
        <Label>{machines.length} makine · Bugün</Label>
      </Row>
      {using.length > 0 && (
        <Card>
          <Heading small>
            {dryer ? "Aktif kurutmalar" : "Aktif yıkamalar"}
          </Heading>
          <Body muted>Kalan süre · çoktan aza</Body>
          {using.map((machine) => {
            const watched = state.snapshot?.watches.some(
              (w) => w.machineId === machine.id,
            );
            const program = state.snapshot?.programs.find(
              (p) =>
                p.id ===
                state.snapshot?.reservations.find(
                  (r) => r.machineId === machine.id && r.status === "running",
                )?.programId,
            );
            return (
              <View
                key={machine.id}
                style={{
                  gap: 10,
                  paddingVertical: 14,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Heading small>{machine.name}</Heading>
                <Text
                  style={{
                    fontSize: 25,
                    fontWeight: "700",
                    color: dryer ? "#a66e22" : colors.blue,
                  }}
                >
                  {countdown(machine.estimatedEndAt, now)}
                </Text>
                <Body muted>
                  {program?.name} · Tahmini bitiş{" "}
                  {machine.estimatedEndAt
                    ? time(machine.estimatedEndAt, space.timezone)
                    : "—"}
                </Body>
                <Button
                  secondary
                  label={
                    watched
                      ? "Boşalma bildirimini kaldır"
                      : "Boşalınca haber ver"
                  }
                  icon="notifications-outline"
                  busy={state.busy}
                  onPress={() =>
                    void state.act(
                      () => client.watchMachine(machine.id, !watched),
                      watched
                        ? "Bildirim takibi kaldırıldı."
                        : "Teslim onaylanınca uygulama içi bildirim gelecek.",
                    )
                  }
                />
                <Button
                  secondary
                  label="Bu makine için sıra iste"
                  icon="time-outline"
                  disabled={hasRight || state.busy}
                  onPress={() => {
                    state.clearNotice();
                    setWaiting(machine);
                  }}
                />
              </View>
            );
          })}
          <Notice>
            Bildirim sana hak ayırmaz. Sıra isteği boşalan yerde süreli teklif
            verir.
          </Notice>
        </Card>
      )}
      {reservations.length > 0 && (
        <Card accent>
          <Badge
            text={
              reservations[0].status === "running"
                ? "Kullanımın sürüyor"
                : "Sıran ayrıldı"
            }
          />
          <Heading small>
            {state.snapshot?.machines.find(
              (machine) => machine.id === reservations[0].machineId,
            )?.name ?? "Rezervasyonun"}
          </Heading>
          <Body>
            {time(
              reservations[0].startedAt ?? reservations[0].startsAt,
              space.timezone,
            )}{" "}
            ·{" "}
            {
              state.snapshot?.programs.find(
                (program) => program.id === reservations[0].programId,
              )?.name
            }
          </Body>
          <Button
            label="Sıramı görüntüle"
            secondary
            onPress={onQueue}
            icon="arrow-forward-outline"
          />
        </Card>
      )}
      {machines.length === 0 && (
        <Card>
          <Empty
            icon="cube-outline"
            title={
              dryer
                ? "Henüz kurutma makinesi yok"
                : "Henüz çamaşır makinesi yok"
            }
            text="Alan yöneticisi makineleri ve programları eklediğinde burada görünür."
          />
        </Card>
      )}
      {machines.map((machine) => {
        const status = machineStatuses[machine.status];
        const programs =
          state.snapshot?.programs.filter(
            (program) => program.machineId === machine.id,
          ) ?? [];
        return (
          <Card key={machine.id}>
            <Row>
              <View style={s.machineHeading}>
                <View style={s.visual}>
                  <MachineVisual
                    available={machine.status === "available"}
                    type={machine.type}
                  />
                </View>
                <View style={{ gap: 7, flex: 1 }}>
                  <Heading small>{machine.name}</Heading>
                  <Label>
                    {dryer ? "Kurutma makinesi" : "Çamaşır makinesi"}
                  </Label>
                  <Badge text={status.label} tone={status.tone} />
                </View>
              </View>
            </Row>
            {machine.status === "running" && machine.estimatedEndAt && (
              <Body muted>
                Tahmini bitiş · {time(machine.estimatedEndAt, space.timezone)}
              </Body>
            )}
            {machine.status === "awaiting_pickup" && (
              <Body muted>
                Programın tahmini süresi doldu. Çamaşırlar alınmadan makine boş
                sayılmaz.
              </Body>
            )}
            {machine.status === "needs_check" && (
              <Body muted>Yönetim makinenin durumunu kontrol ediyor.</Body>
            )}
            {machine.status === "out_of_order" && (
              <Body muted>Bu makinede yeni kullanım kapalı.</Body>
            )}
            <Text style={s.programs}>
              {programs.length
                ? programs
                    .map(
                      (program) =>
                        `${program.name} ${program.durationMinutes} dk`,
                    )
                    .join("  ·  ")
                : "Program bilgisi bekleniyor"}
            </Text>
            <Button
              label="Uygun saatleri gör"
              secondary={machine.status !== "available"}
              disabled={
                hasRight ||
                machine.status === "out_of_order" ||
                machine.status === "needs_check" ||
                programs.length === 0 ||
                state.busy
              }
              onPress={() => {
                state.clearNotice();
                setBooking(machine);
              }}
              icon="calendar-outline"
            />
          </Card>
        );
      })}
      <Notice>
        QR okutmak fiziksel makineyi çalıştırmaz. Makineyi panelinden başlatıp
        uygulamada kullanımını onayla.
      </Notice>
      {booking && (
        <BookingSheet
          machine={booking}
          space={space}
          state={state}
          onClose={() => setBooking(null)}
          onReserved={onQueue}
        />
      )}
      {waiting && (
        <WaitlistSheet
          machineId={waiting.id}
          space={space}
          state={state}
          onClose={() => setWaiting(null)}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  machineHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
  },
  visual: {
    width: 64,
    height: 72,
    backgroundColor: colors.background,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  programs: { fontSize: 13, color: colors.muted, lineHeight: 21 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  slot: {
    minWidth: 70,
    minHeight: 46,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: "center",
  },
  selectedSlot: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  slotText: { fontSize: 15, fontWeight: "600", color: colors.ink },
});
