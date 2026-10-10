import { useEffect, useRef, useState } from "react";
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
import { machineCode } from "@camasir/core";
import {
  Body,
  Button,
  Card,
  Chips,
  Field,
  Heading,
  Icon,
  Label,
  Notice,
  Sheet,
} from "./ui";
import { client } from "../services/client";
import { errorMessage, time } from "../services/format";
import type { LaundryState } from "../hooks/useLaundry";
import { useClock } from "../hooks/useClock";
import { colors } from "../theme";

export function MachineScan({
  state,
  initialCode = "",
  onClose,
  onMachine,
  onStarted,
}: {
  state: LaundryState;
  initialCode?: string;
  onClose: () => void;
  onMachine: (spaceId: string) => void;
  onStarted: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [code, setCode] = useState(initialCode);
  const [machineId, setMachineId] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [programId, setProgramId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const once = useRef(false);
  const resolvingRef = useRef(false);
  const now = useClock();
  const machine = state.snapshot?.machines.find((m) => m.id === machineId);
  const space = state.snapshot?.spaces.find((s) => s.id === machine?.spaceId);
  const programs =
    state.snapshot?.programs.filter((p) => p.machineId === machineId) ?? [];
  const program = programs.find((p) => p.id === programId);
  const own = state.snapshot?.reservations.find(
    (r) =>
      r.machineId === machineId &&
      r.userId === state.profile?.id &&
      r.status === "confirmed",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  async function resolve(value: string) {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setCamera(false);
    setResolving(true);
    setError("");
    setCode(value);
    try {
      if (!machineCode(value))
        throw new Error("Bu QR bir ÇamaşırSırası makine etiketi değil.");
      const found = await client.resolveMachine(value);
      await state.refresh();
      setMachineId(found.machineId);
      onMachine(found.spaceId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setResolving(false);
      resolvingRef.current = false;
    }
  }
  useEffect(() => {
    if (initialCode && !once.current) {
      once.current = true;
      void resolve(initialCode);
    }
  }, [initialCode]);
  useEffect(() => {
    if (machineId && !programId)
      setProgramId(own?.programId ?? programs[0]?.id ?? "");
  }, [machineId, programs.length, own?.programId, programId]);
  async function openCamera() {
    try {
      const result = permission?.granted
        ? permission
        : await requestPermission();
      if (result.granted) setCamera(true);
      else
        setError("Kamera izni verilmedi. Etiketteki kodu elle girebilirsin.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <Sheet
      title={machine ? `${machine.name} · Hızlı başlat` : "Makine QR’ını okut"}
      visible
      onClose={() => !state.busy && !resolving && onClose()}
    >
      {!machine ? (
        <>
          <Body muted>
            QR’ı okutunca makine ve kayıtlı programları açılır. Alan üyeliğinin
            onaylı olması gerekir.
          </Body>
          {Platform.OS !== "web" && (
            <>
              {camera && foreground && permission?.granted && (
                <View
                  style={{ height: 240, borderRadius: 16, overflow: "hidden" }}
                >
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={({ data }) => void resolve(data)}
                  />
                </View>
              )}
              <Button
                label={camera ? "Kamerayı kapat" : "QR okut"}
                icon="qr-code-outline"
                secondary
                disabled={resolving}
                onPress={() => (camera ? setCamera(false) : void openCamera())}
              />
              {permission && !permission.granted && !permission.canAskAgain && (
                <Button
                  secondary
                  label="Kamera iznini ayarlardan aç"
                  onPress={() => void Linking.openSettings()}
                />
              )}
            </>
          )}
          <Field
            label="Makine kodu / QR bağlantısı"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Makineyi bul"
            busy={resolving}
            disabled={!code.trim()}
            onPress={() => void resolve(code)}
          />
        </>
      ) : (
        <>
          <Card>
            <Heading small>{space?.name}</Heading>
            <Body muted>
              {machine.status === "available"
                ? "Programını seç ve makineyi panelinden çalıştır."
                : "Makine henüz boş değil; teslim onayı bekleniyor."}
            </Body>
          </Card>
          <Label>Program kısayolları</Label>
          <Chips
            values={programs.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.durationMinutes} dk`,
            }))}
            selected={programId}
            onSelect={(value) => {
              setProgramId(value);
              setConfirmed(false);
            }}
          />
          {own && (
            <Notice>
              Bu makinede rezervasyonun var. Ayrılmış programını ve başlangıç
              saatini kullanmalısın.
            </Notice>
          )}
          {program && (
            <Card accent>
              <Heading small>{program.durationMinutes} dakika</Heading>
              <Body>
                Tahmini bitiş ·{" "}
                {time(
                  new Date(
                    now + program.durationMinutes * 60_000,
                  ).toISOString(),
                  space?.timezone ?? "Europe/Istanbul",
                )}
              </Body>
              <Body muted>
                Başlatınca sayaç bu program süresinden başlayacak.
              </Body>
            </Card>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed(!confirmed)}
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
              paddingVertical: 10,
            }}
          >
            <Icon
              name={confirmed ? "checkbox" : "square-outline"}
              color={confirmed ? colors.blue : colors.muted}
            />
            <Text style={{ flex: 1, color: colors.ink, lineHeight: 22 }}>
              Makine boştu; çamaşırlarımı koydum ve seçtiğim programı makine
              panelinden başlattım.
            </Text>
          </Pressable>
          <Button
            label="Kullanımı başlat"
            busy={state.busy}
            disabled={!confirmed || !program || machine.status !== "available"}
            onPress={() =>
              void state
                .act(
                  () => client.startWalkIn(code, programId),
                  "Kullanım başladı. Geri sayımını Sıram ekranından takip edebilirsin.",
                )
                .then((ok) => {
                  if (ok) {
                    onClose();
                    onStarted();
                  }
                })
            }
          />
          <Notice>
            Bir alanda tek aktif kullanım, rezervasyon veya sıra hakkın
            olabilir. Süre dolunca çamaşırlar alınmadan makine boş sayılmaz.
          </Notice>
        </>
      )}
      {(error || state.error) && <Notice error>{error || state.error}</Notice>}
    </Sheet>
  );
}
