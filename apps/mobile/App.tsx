import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  Badge,
  Body,
  Button,
  Card,
  Empty,
  Heading,
  Icon,
  Label,
  Notice,
  Sheet,
  type IconName,
} from "./src/components/ui";
import { useLaundry } from "./src/hooks/useLaundry";
import { AuthScreen } from "./src/screens/AuthScreen";
import { AccessScreen, AreaScreen } from "./src/screens/AreaScreen";
import { MachinesScreen } from "./src/screens/MachinesScreen";
import { QueueScreen } from "./src/screens/QueueScreen";
import { client } from "./src/services/client";
import { colors } from "./src/theme";
import { inviteFromUrl } from "./src/services/invites";
import { machineCode } from "@camasir/core";
import { MachineScan } from "./src/components/MachineScan";

const tabs: Array<{
  id: "machines" | "queue" | "area";
  label: string;
  icon: IconName;
}> = [
  { id: "machines", label: "Makineler", icon: "grid-outline" },
  { id: "queue", label: "Sıram", icon: "time-outline" },
  { id: "area", label: "Alan", icon: "people-outline" },
];

export default function App() {
  const state = useLaundry();
  const [spaceId, setSpaceId] = useState("");
  const [tab, setTab] = useState<"machines" | "queue" | "area">("machines");
  const [picker, setPicker] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [machineQr, setMachineQr] = useState("");
  const [scanning, setScanning] = useState(false);
  const clearInvite = useCallback(() => setInviteCode(""), []);
  const spaces = state.snapshot?.spaces ?? [];
  const space = spaces.find((item) => item.id === spaceId) ?? spaces[0];
  useEffect(() => {
    if (!state.profile) {
      setSpaceId("");
      setTab("machines");
    }
  }, [state.profile?.id]);
  useEffect(() => {
    const receive = (url: string | null) => {
      if (url?.startsWith("camasirsirasi://machine") && machineCode(url)) {
        setMachineQr(url);
        setScanning(true);
        return;
      }
      const code = url ? inviteFromUrl(url) : null;
      if (code) {
        setInviteCode(code);
        setTab("area");
      }
    };
    void Linking.getInitialURL().then(receive);
    const listener = Linking.addEventListener("url", (event) =>
      receive(event.url),
    );
    return () => listener.remove();
  }, []);
  const selectSpace = (id: string) => {
    setSpaceId(id);
    setTab("machines");
    setPicker(false);
  };
  const active = space?.membershipStatus === "active";
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.frame}>
        {state.initializing ? (
          <View style={s.loading}>
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={s.loadingText}>ÇamaşırSırası hazırlanıyor…</Text>
          </View>
        ) : !state.profile ? (
          <AuthScreen state={state} />
        ) : (
          <>
            <View style={s.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aktif alanı seç"
                onPress={() => setPicker(true)}
                style={s.spaceSelector}
              >
                <View style={s.logo}>
                  <Icon name="water-outline" size={22} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.overline}>ÇAMAŞIRSIRASI</Text>
                  <Text numberOfLines={1} style={s.spaceName}>
                    {space?.name ?? "Alanını seç"}
                  </Text>
                </View>
                <Icon name="chevron-down" size={17} color={colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bildirimleri görüntüle"
                onPress={() => setNotifications(true)}
                style={s.notificationButton}
              >
                <Icon name="notifications-outline" color={colors.ink} />
                {!!state.snapshot?.notifications.length && (
                  <View style={s.dot} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Makine QR’ını okut"
                onPress={() => {
                  setMachineQr("");
                  setScanning(true);
                }}
                style={s.notificationButton}
              >
                <Icon name="qr-code-outline" color={colors.blue} />
              </Pressable>
            </View>
            <ScrollView
              key={`${space?.id}-${tab}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.content}
              refreshControl={
                <RefreshControl
                  refreshing={state.refreshing}
                  onRefresh={() => void state.refresh()}
                  tintColor={colors.blue}
                />
              }
            >
              {client.mode === "demo" && (
                <View style={s.demo}>
                  <Icon name="flask-outline" size={15} color={colors.amber} />
                  <Text style={s.demoText}>
                    Sunum modu · Bu cihazda örnek veriler
                  </Text>
                </View>
              )}
              {!!state.error && <Notice error>{state.error}</Notice>}
              {!!state.message && <Notice>{state.message}</Notice>}
              {!state.snapshot && (
                <Card>
                  <Empty
                    icon="cloud-offline-outline"
                    title="Veriler yüklenemedi"
                    text="Bağlantını kontrol edip tekrar dene. Güncel üyelik bilgisi olmadan kullanım işlemi açılmaz."
                  />
                  <Button
                    label="Yeniden dene"
                    secondary
                    busy={state.refreshing}
                    onPress={() => void state.refresh()}
                  />
                </Card>
              )}
              {state.snapshot &&
                (tab === "area" ? (
                  <AreaScreen
                    state={state}
                    space={space}
                    onCreated={selectSpace}
                    inviteCode={inviteCode}
                    onInviteHandled={clearInvite}
                  />
                ) : !active || !space ? (
                  <AccessScreen
                    state={state}
                    space={space}
                    onCreated={selectSpace}
                  />
                ) : tab === "machines" ? (
                  <MachinesScreen
                    state={state}
                    space={space}
                    onQueue={() => setTab("queue")}
                  />
                ) : (
                  <QueueScreen
                    state={state}
                    space={space}
                    onMachines={() => setTab("machines")}
                  />
                ))}
            </ScrollView>
            <View style={s.navigation}>
              {tabs.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === item.id }}
                  accessibilityLabel={item.label}
                  onPress={() => {
                    setTab(item.id);
                    state.clearNotice();
                  }}
                  style={[s.navItem, tab === item.id && s.navSelected]}
                >
                  <Icon
                    name={item.icon}
                    color={tab === item.id ? colors.blue : colors.muted}
                    size={23}
                  />
                  <Text
                    style={[
                      s.navText,
                      tab === item.id && { color: colors.blue },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Sheet
              title="Alanların"
              visible={picker}
              onClose={() => setPicker(false)}
            >
              {spaces.length === 0 && (
                <Body muted>
                  Henüz bir alana katılmadın. Alan sekmesinden davet koduyla
                  başvurabilirsin.
                </Body>
              )}
              {spaces.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => selectSpace(item.id)}
                  style={[
                    s.spaceOption,
                    item.id === space?.id && { borderColor: colors.blue },
                  ]}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <Heading small>{item.name}</Heading>
                    <Label>
                      {item.kind} ·{" "}
                      {item.role === "owner"
                        ? "Alan sahibi"
                        : item.role === "admin"
                          ? "Yönetici"
                          : "Üye"}
                    </Label>
                  </View>
                  <Badge
                    text={
                      item.membershipStatus === "active"
                        ? "Aktif"
                        : item.membershipStatus === "pending"
                          ? "Bekliyor"
                          : "Kapalı"
                    }
                    tone={
                      item.membershipStatus === "active" ? "green" : "amber"
                    }
                  />
                </Pressable>
              ))}
              <Button
                label="Katıl veya yeni alan oluştur"
                secondary
                onPress={() => {
                  setPicker(false);
                  setTab("area");
                }}
              />
            </Sheet>
            {scanning && (
              <MachineScan
                state={state}
                initialCode={machineQr}
                onClose={() => {
                  setScanning(false);
                  setMachineQr("");
                }}
                onMachine={(id) => {
                  setSpaceId(id);
                  setTab("machines");
                }}
                onStarted={() => setTab("queue")}
              />
            )}
            <Sheet
              title="Bildirimler"
              visible={notifications}
              onClose={() => setNotifications(false)}
            >
              {state.snapshot?.notifications.length ? (
                state.snapshot.notifications.map((item) => (
                  <Card key={item.id}>
                    <Heading small>{item.title}</Heading>
                    <Body muted>{item.body}</Body>
                    <Label>
                      {new Date(item.createdAt).toLocaleString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: space?.timezone ?? "Europe/Istanbul",
                      })}
                    </Label>
                  </Card>
                ))
              ) : (
                <Empty
                  icon="notifications-outline"
                  title="Henüz bildirim yok"
                  text="Üyelik kararları, rezervasyonlar ve boşalan yer teklifleri burada görünür."
                />
              )}
              <Notice>
                İlk sürüm uygulama içi bildirim kullanır. Arka planda cihaz push
                bildirimi henüz etkin değildir.
              </Notice>
            </Sheet>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
  },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    backgroundColor: colors.background,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  loadingText: { fontSize: 15, color: colors.muted },
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  spaceSelector: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  overline: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.muted,
    marginBottom: 4,
  },
  spaceName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    color: colors.ink,
  },
  notificationButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    height: 7,
    width: 7,
    borderRadius: 5,
    backgroundColor: colors.blue,
    right: 10,
    top: 9,
    borderWidth: 1,
    borderColor: colors.white,
  },
  content: { padding: 22, gap: 18, paddingBottom: 32 },
  demo: { flexDirection: "row", gap: 7, alignItems: "center" },
  demoText: { fontSize: 12, color: colors.amber, lineHeight: 18 },
  navigation: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 9,
    paddingHorizontal: 18,
    gap: 10,
  },
  navItem: {
    flex: 1,
    minHeight: 56,
    padding: 9,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  navSelected: { backgroundColor: colors.blueSoft },
  navText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: colors.muted,
  },
  spaceOption: {
    padding: 17,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
});
