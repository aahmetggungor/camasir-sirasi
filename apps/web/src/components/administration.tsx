"use client";

import { useState, type FormEvent } from "react";
import {
  Ban,
  Check,
  Clipboard,
  Clock3,
  KeyRound,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import type { Membership, Space, SpaceRules } from "@camasir/core";
import { useLaundry } from "@/lib/laundry";
import { Button, EmptyState, Field, Modal, StatusBadge, dateTime } from "./ui";

const roleLabel: Record<string, string> = {
  owner: "Alan sahibi",
  admin: "Yönetici",
  member: "Üye",
};

export function MembersPage({ space }: { space: Space }) {
  const { snapshot, busy, run } = useLaundry();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Membership | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | "block">(
    "approve",
  );
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState("");
  const all = snapshot?.memberships.filter((m) => m.spaceId === space.id) ?? [];
  const members = all
    .filter((m) => filter === "all" || m.status === filter)
    .sort(
      (a, b) =>
        (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1),
    );
  const pending = all.filter((m) => m.status === "pending").length;
  function open(member: Membership, type: typeof decision) {
    setSelected(member);
    setDecision(type);
    setVerified(false);
    setReason("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const result = await run(
      "Üyelik güncelleniyor",
      async (client) => {
        if (decision === "approve")
          await client.approveMember(selected.id, verified);
        if (decision === "reject")
          await client.rejectMember(selected.id, reason.trim());
        if (decision === "block") await client.blockMember(selected.id);
        return true;
      },
      decision === "approve"
        ? "Üyelik onaylandı. Kullanıcı artık bu alana erişebilir."
        : decision === "reject"
          ? "Katılım talebi reddedildi."
          : "Üyenin bu alandaki erişimi kapatıldı.",
    );
    if (result) setSelected(null);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ALAN ERİŞİMİ</span>
          <h1>Üyeler</h1>
          <p>Yalnız doğruladığın kişilere çamaşırhane erişimi ver.</p>
        </div>
        <span className={`outline-pill ${pending ? "pending-pill" : ""}`}>
          <Users size={16} /> {pending} başvuru bekliyor
        </span>
      </div>
      <div className="verification-callout">
        <ShieldCheck size={23} />
        <div>
          <strong>Onaydan önce sakin kaydını doğrula.</strong>
          <p>
            Doğrulanmış e-postayı kurumun bilinen kaydıyla eşleştir veya kişiyi
            yetkili personel olarak doğrula. Ad ve oda numarası tek başına
            yeterli değildir.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>
            Alan üyeleri <span className="count">{all.length}</span>
          </h2>
          <div className="segmented">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              Tümü
            </button>
            <button
              className={filter === "pending" ? "selected" : ""}
              onClick={() => setFilter("pending")}
            >
              Bekleyenler {pending > 0 && <span>{pending}</span>}
            </button>
            <button
              className={filter === "active" ? "selected" : ""}
              onClick={() => setFilter("active")}
            >
              Aktif
            </button>
          </div>
        </div>
        {members.length === 0 ? (
          <EmptyState
            icon={<Users size={30} />}
            title={
              filter === "pending"
                ? "Bekleyen başvuru yok"
                : "Bu görünümde üye yok"
            }
            text="Katılım davetini paylaştığında yeni başvurular bu ekranda görünecek."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Üye</th>
                  <th>Oda / birim</th>
                  <th>Rol</th>
                  <th>Durum</th>
                  <th className="text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-identity">
                        <span className="avatar avatar-small">
                          {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                        </span>
                        <div>
                          <strong>{member.name}</strong>
                          <span className="table-subtext">{member.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{member.room || "—"}</td>
                    <td>
                      <span className="role-text">
                        {roleLabel[member.role]}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={member.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {member.status === "pending" && (
                          <>
                            <Button
                              variant="secondary"
                              disabled={!!busy}
                              onClick={() => open(member, "approve")}
                            >
                              <Check size={15} /> İncele
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={!!busy}
                              onClick={() => open(member, "reject")}
                            >
                              Reddet
                            </Button>
                          </>
                        )}
                        {member.role !== "owner" &&
                          ["active", "pending"].includes(member.status) && (
                            <button
                              className="icon-button danger-icon"
                              aria-label={`${member.name} erişimini kapat`}
                              title="Erişimi kapat"
                              disabled={!!busy}
                              onClick={() => open(member, "block")}
                            >
                              <Ban size={17} />
                            </button>
                          )}
                        {["blocked", "rejected", "removed"].includes(
                          member.status,
                        ) && <span className="muted small">Erişim kapalı</span>}
                        {member.role === "owner" && (
                          <span className="muted small">Alan sahibi</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected && (
        <Modal
          title={
            decision === "approve"
              ? "Katılım talebini incele"
              : decision === "reject"
                ? "Katılım talebini reddet"
                : "Alan erişimini kapat"
          }
          description={`${selected.name} · ${selected.email}`}
          onClose={() => setSelected(null)}
        >
          <form className="form-stack" onSubmit={submit}>
            <div className="member-detail">
              <span>Oda / birim</span>
              <strong>{selected.room || "Belirtilmedi"}</strong>
              <span>Başvuru tarihi</span>
              <strong>{dateTime(selected.createdAt)}</strong>
            </div>
            {decision === "approve" ? (
              <>
                <p className="inline-info">
                  <ShieldCheck size={21} /> Hesabın e-posta adresi veya kişinin
                  yetkili kullanım izni kurumun güvenilir kaydıyla kontrol
                  edilmelidir.
                </p>
                <label className="checkbox-field verification-checkbox">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(event) => setVerified(event.target.checked)}
                    required
                  />
                  <span>
                    <strong>Sakin kaydıyla doğruladım.</strong> Bu kişinin bu
                    çamaşırhaneyi kullanmasına izin verildiğini kontrol ettim.
                  </span>
                </label>
              </>
            ) : decision === "reject" ? (
              <Field label="Ret gerekçesi">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Örn. Kurumun güncel sakin kaydında doğrulanamadı."
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                />
              </Field>
            ) : (
              <p className="confirmation-text">
                Bu kişi yeni rezervasyon yapamayacak. Gelecekteki kullanım
                hakları kapatılacak; devam eden fiziksel yıkama yönetici
                kontrolünde kalacak.
              </p>
            )}
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                variant={decision === "approve" ? "primary" : "danger"}
                disabled={!!busy || (decision === "approve" && !verified)}
              >
                {busy ??
                  (decision === "approve"
                    ? "Üyeliği onayla"
                    : decision === "reject"
                      ? "Talebi reddet"
                      : "Erişimi kapat")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function InvitesPage({ space }: { space: Space }) {
  const { busy, run, setNotice } = useLaundry();
  const [invite, setInvite] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  async function generate() {
    const result = await run(
      "Davet oluşturuluyor",
      (client) => client.createInvite(space.id),
      "Davet oluşturuldu. Yalnız alanındaki kişilere ilet.",
    );
    if (result) {
      setInvite(result);
      setCopied(false);
    }
  }
  async function copy(link = false) {
    if (!invite) return;
    const text = link
      ? `${window.location.origin}/?invite=${encodeURIComponent(invite.code)}`
      : invite.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setNotice({
        kind: "error",
        text: "Panoya erişilemedi. Aşağıdaki kodu seçip elle kopyalayabilirsin.",
      });
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">KAPALI TOPLULUK</span>
          <h1>Davetler</h1>
          <p>Doğru kişileri alanına davet et, her başvuruyu onayla.</p>
        </div>
        <Button
          disabled={!!busy}
          onClick={() => {
            void generate();
          }}
        >
          <Plus size={17} />
          {busy ?? "Davet oluştur"}
        </Button>
      </div>
      <div className="invite-layout">
        <section className="panel invite-main">
          <div className="panel-header">
            <h2>Katılım daveti</h2>
            <KeyRound size={20} />
          </div>
          {invite ? (
            <div className="generated-invite">
              <span className="section-kicker">{space.name}</span>
              <p>Katılmak isteyen kişiler bu kodu uygulamaya girebilir.</p>
              <code className="invite-code">{invite.code}</code>
              <span className="expiry">
                <Clock3 size={16} /> Son kullanım: {dateTime(invite.expiresAt)}
              </span>
              <div className="two-columns">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void copy();
                  }}
                >
                  <Clipboard size={16} />
                  {copied ? "Kopyalandı" : "Kodu kopyala"}
                </Button>
                <Button
                  onClick={() => {
                    void copy(true);
                  }}
                >
                  Davet bağlantısını kopyala
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<KeyRound size={31} />}
              title="Alanına katılmanın ilk adımı"
              text="Süreli bir davet oluştur. Kod, yalnız üyelik başvurusu oluşturur; erişimi sen açarsın."
            >
              <Button
                disabled={!!busy}
                onClick={() => {
                  void generate();
                }}
              >
                <Plus size={17} /> İlk daveti oluştur
              </Button>
            </EmptyState>
          )}
        </section>
        <aside className="panel invite-explainer">
          <span className="explanation-icon">
            <ShieldCheck size={25} />
          </span>
          <h3>Davet, üyelik onayı değildir.</h3>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Kodu paylaş</strong>
                <p>Yönetimin izin verdiği kişilere doğrudan ilet.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Başvuruyu doğrula</strong>
                <p>
                  Üyenin e-posta adresini veya kimliğini kurum kaydıyla kontrol
                  et.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Erişimi onayla</strong>
                <p>Onaylanan üyeler makineleri kullanabilir.</p>
              </div>
            </li>
          </ol>
          <p className="muted small">
            Davetin geçerliliği ve kullanım sınırı sunucuda kontrol edilir.
          </p>
        </aside>
      </div>
    </>
  );
}

const ruleFields: {
  key: keyof SpaceRules;
  label: string;
  suffix: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "openHour",
    label: "Açılış saati",
    suffix: ":00",
    hint: "Çamaşırhanenin ilk kullanım saati.",
    min: 0,
    max: 23,
  },
  {
    key: "closeHour",
    label: "Kapanış saati",
    suffix: ":00",
    hint: "Yıkama ve teslim bu saate kadar tamamlanmalı.",
    min: 1,
    max: 24,
  },
  {
    key: "peakStartHour",
    label: "Yoğun saat başlangıcı",
    suffix: ":00",
    hint: "Yoğun kullanım kotasının başladığı saat.",
    min: 0,
    max: 23,
  },
  {
    key: "peakEndHour",
    label: "Yoğun saat bitişi",
    suffix: ":00",
    hint: "Yoğun kullanım kotasının bittiği saat.",
    min: 1,
    max: 24,
  },
  {
    key: "dailyLimit",
    label: "Günlük kullanım sınırı",
    suffix: " kullanım",
    hint: "Bir kişinin gün içinde kullanabileceği hak.",
    min: 1,
    max: 10,
  },
  {
    key: "peakDailyLimit",
    label: "Yoğun saat kullanım sınırı",
    suffix: " kullanım",
    hint: "Günlük kota içindeki yoğun saat hakkı.",
    min: 1,
    max: 10,
  },
  {
    key: "startGraceMinutes",
    label: "Başlatma toleransı",
    suffix: " dk",
    hint: "Gelmezse hakkın bırakılacağı süre.",
    min: 1,
    max: 30,
  },
  {
    key: "pickupMinutes",
    label: "Çamaşırları alma tamponu",
    suffix: " dk",
    hint: "Programdan sonra ayrılan teslim süresi.",
    min: 1,
    max: 60,
  },
  {
    key: "offerMinutes",
    label: "Teklif kabul süresi",
    suffix: " dk",
    hint: "Bekleyen kişinin teklife cevap süresi.",
    min: 1,
    max: 15,
  },
  {
    key: "arrivalMinutes",
    label: "Teklif sonrası geliş süresi",
    suffix: " dk",
    hint: "Kabul eden kişinin makineye ulaşma süresi.",
    min: 1,
    max: 30,
  },
];

export function RulesPage({ space }: { space: Space }) {
  const { busy, run, setNotice } = useLaundry();
  const [rules, setRules] = useState<SpaceRules>({ ...space.rules });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      rules.openHour >= rules.closeHour ||
      rules.peakStartHour >= rules.peakEndHour ||
      rules.peakDailyLimit > rules.dailyLimit ||
      rules.peakStartHour < rules.openHour ||
      rules.peakEndHour > rules.closeHour
    ) {
      setNotice({
        kind: "error",
        text: "Saat aralıkları sıralı olmalı, yoğun saatler çalışma saatlerinde kalmalı ve yoğun saat kotası günlük kotayı aşmamalı.",
      });
      return;
    }
    await run(
      "Kurallar kaydediliyor",
      async (client) => {
        await client.saveRules(space.id, rules);
        return true;
      },
      "Alan kuralları kaydedildi.",
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADİL KULLANIM</span>
          <h1>Alan kuralları</h1>
          <p>Çalışma saatlerini, kotaları ve sıra sürelerini belirle.</p>
        </div>
        <span className="outline-pill">
          <SlidersHorizontal size={16} /> Alan genelinde uygulanır
        </span>
      </div>
      <form className="panel rules-panel" onSubmit={submit}>
        <div className="panel-header">
          <h2>Kullanım ayarları</h2>
          <span className="muted small">Türkiye saati · Europe/Istanbul</span>
        </div>
        <div className="rules-grid">
          {ruleFields.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <div className="input-with-suffix">
                <input
                  type="number"
                  value={rules[field.key]}
                  min={field.min}
                  max={field.max}
                  required
                  onChange={(event) =>
                    setRules({
                      ...rules,
                      [field.key]: Number(event.target.value),
                    })
                  }
                />
                <span>{field.suffix}</span>
              </div>
            </Field>
          ))}
        </div>
        <div className="rules-footer">
          <p>
            <ShieldCheck size={18} /> Aynı kurallar web ve mobilde sunucu
            tarafından uygulanır.
          </p>
          <Button type="submit" disabled={!!busy}>
            {busy ?? "Değişiklikleri kaydet"}
            <Check size={17} />
          </Button>
        </div>
      </form>
    </>
  );
}
