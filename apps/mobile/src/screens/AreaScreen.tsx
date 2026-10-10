import { useEffect, useState } from "react";
import { View } from "react-native";
import type { InvitePreview, Space } from "@camasir/core";
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
  Label,
  Notice,
  Row,
  Sheet,
} from "../components/ui";
import type { LaundryState } from "../hooks/useLaundry";
import { client } from "../services/client";
import { errorMessage } from "../services/format";
import { inviteFromUrl } from "../services/invites";

const statusNames = {
  pending: "Onay bekliyor",
  active: "Aktif üye",
  rejected: "Başvuru reddedildi",
  removed: "Üyelik kapatıldı",
  blocked: "Erişim engellendi",
};
const roleNames = { owner: "Alan sahibi", admin: "Yönetici", member: "Üye" };

// Davet önizlemesi üyelik hakkı vermez. Son adım yalnız başvuru oluşturur.
export function AreaActions({
  state,
  onCreated,
  inviteCode,
  onInviteHandled,
}: {
  state: LaundryState;
  onCreated: (id: string) => void;
  inviteCode?: string;
  onInviteHandled?: () => void;
}) {
  const [sheet, setSheet] = useState<"join" | "create" | null>(null);
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Yurt");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (inviteCode) {
      setCode(inviteCode);
      setPreview(null);
      setError("");
      setSheet("join");
      onInviteHandled?.();
    }
  }, [inviteCode, onInviteHandled]);
  const open = (type: "join" | "create") => {
    state.clearNotice();
    setError("");
    setPreview(null);
    setSheet(type);
  };
  const inspect = async () => {
    if (code.trim().length < 4) {
      setError("Yönetimden aldığın davet kodunu gir.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const parsed = inviteFromUrl(code.trim()) ?? code.trim();
      setCode(parsed);
      setPreview(await client.previewInvite(parsed));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Button
        label="Bir alana katıl"
        secondary
        onPress={() => open("join")}
        icon="enter-outline"
      />
      <Button
        label="Yeni alan oluştur"
        secondary
        onPress={() => open("create")}
        icon="add-outline"
      />
      <Sheet
        title={sheet === "join" ? "Alana katıl" : "Alan oluştur"}
        visible={!!sheet}
        onClose={() => {
          if (!state.busy && !working) setSheet(null);
        }}
      >
        {sheet === "join" ? (
          <>
            <Body muted>
              Yurt, site veya işletme yönetiminden aldığın davet kodunu kullan.
            </Body>
            <Field
              label="Davet kodu"
              value={code}
              onChangeText={(value) => {
                setCode(value);
                setPreview(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={
                client.mode === "demo" ? "Sunum: KUZEY2026" : "Davet kodunu gir"
              }
            />
            <Button
              label="Alanı kontrol et"
              onPress={() => void inspect()}
              busy={working}
              disabled={state.busy}
            />
            {preview && (
              <Card>
                <Badge text="Özel alan" />
                <Heading small>{preview.spaceName}</Heading>
                <Body muted>
                  Davetin son kullanımı:{" "}
                  {new Date(preview.expiresAt).toLocaleDateString("tr-TR")}
                </Body>
                <Field
                  label="Oda / birim (isteğe bağlı)"
                  value={room}
                  onChangeText={setRoom}
                  placeholder="Örn. B blok, 204"
                />
                <Notice>
                  Davet kodu erişim sağlamaz. Yönetici seni doğrulayıp
                  onaylayınca makineler açılır.
                </Notice>
                <Button
                  label="Katılım talebi gönder"
                  busy={state.busy}
                  onPress={() =>
                    void state
                      .act(
                        () =>
                          client.requestMembership(code.trim(), room.trim()),
                        "Başvurun yöneticiye iletildi.",
                      )
                      .then((ok) => {
                        if (ok) {
                          onCreated(preview.spaceId);
                          setSheet(null);
                        }
                      })
                  }
                />
              </Card>
            )}
          </>
        ) : (
          <>
            <Body muted>
              Ortak çamaşırhanen için özel bir alan aç. Üyeleri ve makineleri
              yönetim web panelinden düzenleyebilirsin.
            </Body>
            <Field
              label="Alan adı"
              value={name}
              onChangeText={setName}
              placeholder="Örn. Kuzey Yurdu"
            />
            <Label>Mekân türü</Label>
            <Chips
              values={["Yurt", "Apartman", "Site", "İşletme", "Diğer"].map(
                (value) => ({ value, label: value }),
              )}
              selected={kind}
              onSelect={setKind}
            />
            <Notice>
              Alan adına kurum ismi yazılması resmî kurum doğrulaması anlamına
              gelmez.
            </Notice>
            <Button
              label="Özel alanımı oluştur"
              busy={state.busy}
              onPress={() => {
                if (name.trim().length < 3) {
                  setError("Alan adı en az 3 karakter olmalı.");
                  return;
                }
                void state
                  .act(async () => {
                    const id = await client.createSpace(name.trim(), kind);
                    onCreated(id);
                  }, "Alan oluşturuldu. Makinelerini yönetim panelinden ekleyebilirsin.")
                  .then((ok) => {
                    if (ok) setSheet(null);
                  });
              }}
            />
          </>
        )}
        {(error || state.error) && (
          <Notice error>{error || state.error}</Notice>
        )}
      </Sheet>
    </>
  );
}

export function AccessScreen({
  state,
  space,
  onCreated,
}: {
  state: LaundryState;
  space?: Space;
  onCreated: (id: string) => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <Heading>
        {space?.membershipStatus === "pending"
          ? "Bir adım kaldı."
          : "Alanına hoş geldin."}
      </Heading>
      {space ? (
        <Card>
          <Empty
            icon={
              space.membershipStatus === "pending"
                ? "time-outline"
                : "lock-closed-outline"
            }
            title={statusNames[space.membershipStatus]}
            text={
              space.membershipStatus === "pending"
                ? `${space.name} yönetimi başvurunu inceliyor. Onaylandıktan sonra makineleri görebilir ve sıranı ayırabilirsin.`
                : `${space.name} için şu anda kullanım iznin bulunmuyor. Yeniden erişim için alan yönetimiyle görüş.`
            }
          />
          <Button
            label="Üyelik durumunu yenile"
            secondary
            onPress={() => void state.refresh()}
            busy={state.refreshing}
          />
        </Card>
      ) : (
        <>
          <Body muted>
            Yönetimden aldığın davetle kendi çamaşırhanene katıl. Hesap açmak,
            bir alana otomatik erişim vermez.
          </Body>
          <Card>
            <Empty
              icon="people-outline"
              title="Henüz bir alanın yok"
              text="Davet kodunu girerek başvuru gönder veya yönettiğin mekân için yeni alan oluştur."
            />
          </Card>
        </>
      )}
      <Card>
        <Heading small>Alan işlemleri</Heading>
        <AreaActions state={state} onCreated={onCreated} />
      </Card>
    </View>
  );
}

export function AreaScreen({
  state,
  space,
  onCreated,
  inviteCode,
  onInviteHandled,
}: {
  state: LaundryState;
  space?: Space;
  onCreated: (id: string) => void;
  inviteCode?: string;
  onInviteHandled?: () => void;
}) {
  const rules = space?.rules;
  return (
    <View style={{ gap: 20 }}>
      <Heading>Alanım</Heading>
      <Card>
        <Row>
          <Heading small>{state.profile?.name}</Heading>
          <Badge text="Doğrulanmış hesap" />
        </Row>
        <Body muted>{state.profile?.email}</Body>
      </Card>
      {space && (
        <Card>
          <Heading small>{space.name}</Heading>
          <Row>
            <Badge
              text={statusNames[space.membershipStatus]}
              tone={space.membershipStatus === "active" ? "green" : "amber"}
            />
            <Label>{roleNames[space.role]}</Label>
          </Row>
          <Body muted>
            {space.kind} · {space.timezone}
          </Body>
          {(space.role === "owner" || space.role === "admin") && (
            <Notice>
              Makine ekleme, davet oluşturma ve üye onaylama işlemleri için
              bilgisayarındaki yönetim web panelini kullan.
            </Notice>
          )}
        </Card>
      )}
      {rules && (
        <Card>
          <Heading small>Kullanım kuralları</Heading>
          <Row>
            <Body muted>Açık saatler</Body>
            <Body>
              {String(rules.openHour).padStart(2, "0")}:00 –{" "}
              {String(rules.closeHour).padStart(2, "0")}:00
            </Body>
          </Row>
          <Row>
            <Body muted>Günlük kullanım</Body>
            <Body>{rules.dailyLimit} kez</Body>
          </Row>
          <Row>
            <Body muted>Yoğun saatler</Body>
            <Body>
              {rules.peakStartHour}:00 – {rules.peakEndHour}:00
            </Body>
          </Row>
          <Row>
            <Body muted>Yoğun saat hakkı</Body>
            <Body>{rules.peakDailyLimit} kez</Body>
          </Row>
          <Row>
            <Body muted>Başlangıç toleransı</Body>
            <Body>{rules.startGraceMinutes} dakika</Body>
          </Row>
          <Row>
            <Body muted>Çamaşırları alma</Body>
            <Body>{rules.pickupMinutes} dakika</Body>
          </Row>
          <Notice>
            Tahmini bitiş, makinenin boş olduğunu göstermez. Çamaşırlarını
            aldıktan sonra boşalma onayı ver.
          </Notice>
        </Card>
      )}
      <Card>
        <Heading small>Diğer alanlar</Heading>
        <Body muted>Her alanın üyeliği ve yetkisi ayrıdır.</Body>
        <AreaActions
          state={state}
          onCreated={onCreated}
          inviteCode={inviteCode}
          onInviteHandled={onInviteHandled}
        />
      </Card>
      <Confirm
        label="Hesaptan çıkış yap"
        title="Çıkış yapılsın mı?"
        message="Rezervasyonların hesabında kalır. Aynı hesapla tekrar giriş yaparak devam edebilirsin."
        busy={state.busy}
        onConfirm={() => state.act(() => client.signOut())}
      />
    </View>
  );
}
