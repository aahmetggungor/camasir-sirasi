import { useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { Reservation, Space } from "@camasir/core";
import { countdown } from "@camasir/core";
import {
  Badge,
  Body,
  Button,
  Card,
  Chips,
  Confirm,
  Empty,
  Field,
  Heading,
  Icon,
  Label,
  Notice,
  Row,
  Sheet,
} from "../components/ui";
import type { LaundryState } from "../hooks/useLaundry";
import { client } from "../services/client";
import { errorMessage, remaining, time } from "../services/format";
import { colors } from "../theme";

const reservationLabels = {
  offered: "Teklif",
  confirmed: "Sıran ayrıldı",
  running: "Kullanım başladı",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  no_show: "Başlatılmadı",
};

function StartSheet({
  reservation,
  space,
  state,
  onClose,
}: {
  reservation: Reservation;
  space: Space;
  state: LaundryState;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [qr, setQr] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const machine = state.snapshot?.machines.find(
    (item) => item.id === reservation.machineId,
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) =>
      setForeground(status === "active"),
    );
    return () => sub.remove();
  }, []);
  const openCamera = async () => {
    setError("");
    try {
      const result = permission?.granted
        ? permission
        : await requestPermission();
      if (result.granted) setCamera(true);
      else
        setError(
          "Kamera izni verilmedi. Makine üzerindeki kodu elle girebilirsin.",
        );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Sheet
      title="Kullanımı başlat"
      visible
      onClose={() => !state.busy && onClose()}
    >
      <Card>
        <Heading small>{machine?.name}</Heading>
        <Body>
          {time(reservation.startsAt, space.timezone)} ·{" "}
          {
            state.snapshot?.programs.find(
              (item) => item.id === reservation.programId,
            )?.name
          }
        </Body>
      </Card>
      <Body muted>
        Makinenin yanındaki QR'ı okut veya etiketteki makine kodunu gir. Makine
        boş olmalı.
      </Body>
      {Platform.OS !== "web" ? (
        <>
          {camera && foreground && permission?.granted ? (
            <View style={s.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => {
                  setQr(data);
                  setCamera(false);
                }}
              />
              <View style={s.scanGuide} />
            </View>
          ) : null}
          <Button
            label={camera ? "Kamerayı kapat" : "QR okutmak için kamerayı aç"}
            secondary
            icon="qr-code-outline"
            onPress={() => {
              if (camera) setCamera(false);
              else void openCamera();
            }}
          />
          {permission && !permission.granted && !permission.canAskAgain && (
            <Button
              label="Kamera iznini ayarlardan aç"
              secondary
              onPress={() => void Linking.openSettings()}
            />
          )}
        </>
      ) : (
        <Notice>
          Bu ekran mobil uygulamanın tarayıcı önizlemesi. Kameralı QR taramayı
          Android veya iPhone'da deneyebilirsin; burada makine kodunu gir.
        </Notice>
      )}
      <Field
        label="Makine kodu / QR içeriği"
        value={qr}
        onChangeText={setQr}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Etiketteki makine kodu"
      />
      {client.mode === "demo" && machine?.qrToken && (
        <Notice>Sunum makine kodu: {machine.qrToken}</Notice>
      )}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed(!confirmed)}
        style={s.check}
      >
        <Icon
          name={confirmed ? "checkbox" : "square-outline"}
          color={confirmed ? colors.blue : colors.muted}
        />
        <Text style={s.checkText}>
          Makine boştu; çamaşırlarımı koydum ve makineyi panelinden çalıştırdım.
        </Text>
      </Pressable>
      <Notice>
        Uygulama kullanım kaydını başlatır. Makineyi uzaktan çalıştırmaz ve
        gerçek program bitişini sensörden okumaz.
      </Notice>
      {(error || state.error) && <Notice error>{error || state.error}</Notice>}
      <Button
        label="Kullanımı onayla ve başlat"
        disabled={!confirmed || !qr.trim()}
        busy={state.busy}
        onPress={() =>
          void state
            .act(
              () => client.startUsage(reservation.id, qr.trim()),
              "Kullanım başladı. Tahmini bitişi Sıram ekranından takip edebilirsin.",
            )
            .then((ok) => {
              if (ok) onClose();
            })
        }
      />
    </Sheet>
  );
}

export function WaitlistSheet({
  space,
  state,
  onClose,
  machineId,
}: {
  space: Space;
  state: LaundryState;
  onClose: () => void;
  machineId?: string;
}) {
  const machines =
    state.snapshot?.machines.filter(
      (item) =>
        item.spaceId === space.id &&
        (!machineId || item.id === machineId) &&
        !["out_of_order", "needs_check"].includes(item.status),
    ) ?? [];
  const programs =
    state.snapshot?.programs.filter((item) =>
      machines.some((machine) => machine.id === item.machineId),
    ) ?? [];
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [hours, setHours] = useState("2");
  const until = new Date(
    Date.now() + Number(hours) * 60 * 60 * 1000,
  ).toISOString();
  return (
    <Sheet
      title="Boşalan yere sıraya gir"
      visible
      onClose={() => !state.busy && onClose()}
    >
      <Body muted>
        Seçtiğin makinede programına yetecek boşluk oluşursa, sıradaki uygun
        kişiye süreli teklif gönderilir.
      </Body>
      <Label>Makine ve program</Label>
      {programs.length ? (
        <Chips
          values={programs.map((item) => ({
            value: item.id,
            label: `${machines.find((machine) => machine.id === item.machineId)?.name} · ${item.name} (${item.durationMinutes} dk)`,
          }))}
          selected={programId}
          onSelect={setProgramId}
        />
      ) : (
        <Empty
          icon="time-outline"
          title="Uygun program yok"
          text="Yönetici makineleri ve programları eklediğinde sıraya katılabilirsin."
        />
      )}
      <Label>Ne kadar süre teklif bekleyebilirsin?</Label>
      <Chips
        values={[
          { value: "1", label: "1 saat" },
          { value: "2", label: "2 saat" },
          { value: "4", label: "4 saat" },
        ]}
        selected={hours}
        onSelect={setHours}
      />
      <Card>
        <Body>
          Teklif bekleme süresi · {time(until, space.timezone)}'e kadar
        </Body>
        <Body muted>
          Teklifi {space.rules.offerMinutes} dakika içinde kabul et. Kabulden
          sonra {space.rules.arrivalMinutes} dakika içinde gelip kullanımını
          başlat.
        </Body>
      </Card>
      {!!state.error && <Notice error>{state.error}</Notice>}
      <Button
        label="Bekleme sırasına katıl"
        busy={state.busy}
        disabled={!programId}
        onPress={() =>
          void state
            .act(
              () => client.joinWaitlist(space.id, programId, until),
              "Bekleme sırasına katıldın. Teklif gelirse burada görünecek.",
            )
            .then((ok) => {
              if (ok) onClose();
            })
        }
      />
    </Sheet>
  );
}

export function QueueScreen({
  state,
  space,
  onMachines,
}: {
  state: LaundryState;
  space: Space;
  onMachines: () => void;
}) {
  const [starting, setStarting] = useState<Reservation | null>(null);
  const [waitSheet, setWaitSheet] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const data = state.snapshot;
  const reservations =
    data?.reservations.filter(
      (item) => item.spaceId === space.id && item.userId === state.profile?.id,
    ) ?? [];
  const active = reservations.filter((item) =>
    ["confirmed", "running"].includes(item.status),
  );
  const history = reservations
    .filter((item) =>
      ["completed", "cancelled", "no_show"].includes(item.status),
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 5);
  const waiting =
    data?.waitlist.filter(
      (item) =>
        item.spaceId === space.id &&
        item.userId === state.profile?.id &&
        ["waiting", "offered"].includes(item.status),
    ) ?? [];
  const offers =
    data?.offers.filter(
      (item) =>
        item.spaceId === space.id &&
        item.userId === state.profile?.id &&
        item.status === "pending",
    ) ?? [];
  const machineName = (id: string) =>
    data?.machines.find((item) => item.id === id)?.name ?? "Makine";
  const programName = (id: string) =>
    data?.programs.find((item) => item.id === id)?.name ?? "Program";
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 7 }}>
        <Heading>Sıram</Heading>
        <Body muted>Rezervasyonun, yıkaman ve boşalan yer teklifleri.</Body>
      </View>
      {offers.map((offer) => {
        const expired = new Date(offer.expiresAt).getTime() <= now;
        return (
          <Card accent key={offer.id}>
            <Row>
              <Badge
                text={expired ? "Teklif süresi doldu" : "Sana bir yer açıldı"}
              />
              <Text style={s.countdown}>{remaining(offer.expiresAt, now)}</Text>
            </Row>
            <Heading small>
              {machineName(offer.machineId)} · {programName(offer.programId)}
            </Heading>
            <Body muted>
              {expired
                ? "Bu teklif artık kabul edilemez. Güncel sıra durumunu yenile."
                : `Kabul edersen ${space.rules.arrivalMinutes} dakika içinde makinenin yanına gelip kullanımını başlat.`}
            </Body>
            <Button
              label="Teklifi kabul et"
              disabled={expired}
              busy={state.busy}
              onPress={() =>
                void state.act(
                  () => client.acceptOffer(offer.id),
                  "Teklifi kabul ettin. Makinenin yanına gidip kullanımını başlat.",
                )
              }
              icon="checkmark-outline"
            />
            <Button
              label="Bu teklifi geç"
              secondary
              disabled={state.busy || expired}
              onPress={() =>
                void state.act(
                  () => client.declineOffer(offer.id),
                  "Teklif geçildi.",
                )
              }
            />
          </Card>
        );
      })}
      {active.length === 0 && offers.length === 0 && (
        <Card>
          <Empty
            icon="calendar-clear-outline"
            title="Aktif rezervasyonun yok"
            text="Uygun bir saate rezervasyon yap veya boşalan yerler için bekleme sırasına gir."
          />
          <Button
            label="Makinelere göz at"
            onPress={onMachines}
            icon="arrow-forward-outline"
          />
        </Card>
      )}
      {active.map((reservation) => {
        const running = reservation.status === "running";
        const pickup =
          running &&
          !!reservation.estimatedEndAt &&
          new Date(reservation.estimatedEndAt).getTime() <= now;
        return (
          <Card key={reservation.id}>
            <Row>
              <Badge
                text={
                  pickup
                    ? "Çamaşırlarını kontrol et"
                    : reservationLabels[reservation.status]
                }
                tone={pickup ? "amber" : "blue"}
              />
              <Label>
                {new Date(reservation.startsAt).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                  timeZone: space.timezone,
                })}
              </Label>
            </Row>
            <Heading small>{machineName(reservation.machineId)}</Heading>
            <Body muted>{programName(reservation.programId)}</Body>
            <Row>
              <Body muted>
                {running ? "Kullanım başladı" : "Başlangıç saati"}
              </Body>
              <Text style={s.bigTime}>
                {time(
                  reservation.startedAt ?? reservation.startsAt,
                  space.timezone,
                )}
              </Text>
            </Row>
            {running && reservation.estimatedEndAt && (
              <Row>
                <Body muted>Tahmini bitiş</Body>
                <Text style={s.bigTime}>
                  {time(reservation.estimatedEndAt, space.timezone)}
                </Text>
              </Row>
            )}
            {running && (
              <Text style={s.countdown}>
                {countdown(reservation.estimatedEndAt, now)}
              </Text>
            )}
            {running ? (
              <>
                <Notice>
                  {pickup
                    ? "Tahmini süre doldu. Makineyi kontrol et; çamaşırlarını aldıktan sonra boşalma onayı ver."
                    : "Program süresi tahminidir. Çamaşırlarını aldığında boşalma onayı vererek sırayı ilerlet."}
                </Notice>
                <Confirm
                  label="Çamaşırlarımı aldım"
                  title="Makine boş mu?"
                  message="Çamaşırlarının tamamını aldığını ve makinenin bir sonraki kullanıcı için boş olduğunu onayla."
                  busy={state.busy}
                  onConfirm={() =>
                    state.act(
                      () => client.finishUsage(reservation.id),
                      "Makine boşalma onayın kaydedildi. Teşekkürler!",
                    )
                  }
                />
              </>
            ) : (
              <>
                <Body muted>
                  Saatin geldiğinde {space.rules.startGraceMinutes} dakika
                  içinde kullanımını başlat. Önceki çamaşırlar içerideyse
                  yöneticiye haber ver.
                </Body>
                <Button
                  label="QR ile kullanım başlat"
                  busy={state.busy}
                  onPress={() => {
                    state.clearNotice();
                    setStarting(reservation);
                  }}
                  icon="qr-code-outline"
                />
                <Confirm
                  label="Rezervasyonu iptal et"
                  title="Sıranı bırakmak ister misin?"
                  message="Rezervasyonun iptal olacak. Uygun boşluk bekleyen bir kişiye teklif edilebilir."
                  busy={state.busy}
                  danger
                  onConfirm={() =>
                    state.act(
                      () => client.cancelReservation(reservation.id),
                      "Rezervasyon iptal edildi.",
                    )
                  }
                />
              </>
            )}
          </Card>
        );
      })}
      <Card>
        <Heading small>Bekleme sırası</Heading>
        {waiting.length ? (
          waiting.map((entry) => (
            <View key={entry.id} style={{ gap: 12 }}>
              <Badge
                text={
                  entry.status === "offered" ? "Teklif gönderildi" : "Sıradasın"
                }
                tone="amber"
              />
              <Body>
                {programName(entry.programId)} ·{" "}
                {time(entry.availableUntil, space.timezone)}'e kadar
              </Body>
              <Body muted>
                Yer oluşması durumunda {space.rules.offerMinutes} dakikalık
                teklif gelir. Bildirimler ve teklifler uygulama açıkken
                yenilenir.
              </Body>
              <Confirm
                label="Bekleme sırasından ayrıl"
                title="Sıradan ayrılsın mı?"
                message="Bu bekleme talebi ve varsa ona bağlı teklif sona erecek."
                busy={state.busy}
                onConfirm={() =>
                  state.act(
                    () => client.leaveWaitlist(entry.id),
                    "Bekleme sırasından ayrıldın.",
                  )
                }
              />
            </View>
          ))
        ) : (
          <>
            <Body muted>
              Bugünkü saatler doluysa boşalan yere teklif almak için sıraya gir.
            </Body>
            <Button
              label="Boşalan yere sıraya gir"
              secondary
              disabled={active.length > 0 || offers.length > 0 || state.busy}
              onPress={() => {
                state.clearNotice();
                setWaitSheet(true);
              }}
              icon="time-outline"
            />
            {active.length > 0 && (
              <Label>Alan başına bir aktif kullanım hakkın bulunur.</Label>
            )}
          </>
        )}
      </Card>
      {history.length > 0 && (
        <Card>
          <Heading small>Son işlemlerim</Heading>
          {history.map((item) => (
            <View key={item.id} style={s.historyRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Body>
                  {machineName(item.machineId)} · {programName(item.programId)}
                </Body>
                <Label>
                  {new Date(item.startsAt).toLocaleDateString("tr-TR", {
                    timeZone: space.timezone,
                  })}{" "}
                  · {time(item.startsAt, space.timezone)}
                </Label>
              </View>
              <Badge
                text={reservationLabels[item.status]}
                tone={item.status === "completed" ? "green" : "amber"}
              />
            </View>
          ))}
        </Card>
      )}
      {starting && (
        <StartSheet
          reservation={starting}
          space={space}
          state={state}
          onClose={() => setStarting(null)}
        />
      )}
      {waitSheet && (
        <WaitlistSheet
          space={space}
          state={state}
          onClose={() => setWaitSheet(false)}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  bigTime: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  countdown: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.blue,
    fontVariant: ["tabular-nums"],
  },
  check: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    minHeight: 60,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkText: { fontSize: 14, lineHeight: 22, color: colors.ink, flex: 1 },
  cameraFrame: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#182238",
  },
  scanGuide: {
    width: 160,
    height: 160,
    borderWidth: 2,
    borderColor: colors.white,
    borderRadius: 12,
  },
  historyRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
  },
});
