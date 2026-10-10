"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WashingMachine,
  Wind,
} from "lucide-react";
import type { Space } from "@camasir/core";
import { useLaundry } from "@/lib/laundry";
import { AuthScreen, Brand, CreateSpaceForm, JoinForm } from "./access";
import { MachinesPage } from "./machines";
import { ReservationsPage } from "./reservations";
import { InvitesPage, MembersPage, RulesPage } from "./administration";
import {
  Button,
  EmptyState,
  Modal,
  Notice,
  Spinner,
  StatusBadge,
  dateTime,
} from "./ui";

type Page =
  "washers" | "dryers" | "reservations" | "members" | "invites" | "rules";
const navigation: {
  id: Page;
  label: string;
  icon: typeof WashingMachine;
  admin?: boolean;
}[] = [
  { id: "washers", label: "Çamaşır", icon: WashingMachine },
  { id: "dryers", label: "Kurutma", icon: Wind },
  { id: "reservations", label: "Rezervasyonlar", icon: CalendarDays },
  { id: "members", label: "Üyeler", icon: Users, admin: true },
  { id: "invites", label: "Davetler", icon: KeyRound, admin: true },
  { id: "rules", label: "Kurallar", icon: SlidersHorizontal, admin: true },
];
const roleLabels = { owner: "Alan sahibi", admin: "Yönetici", member: "Üye" };

export function LaundryApp() {
  const { client, profile, snapshot, loading, signOut, refresh } = useLaundry();
  const [spaceId, setSpaceId] = useState("");
  const [page, setPage] = useState<Page>("washers");
  const [dialog, setDialog] = useState<"join" | "create" | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const spaces = snapshot?.spaces ?? [];
  const space =
    spaces.find((s) => s.id === spaceId) ??
    spaces.find((s) => s.membershipStatus === "active") ??
    spaces[0];
  const active = space?.membershipStatus === "active";
  const admin = active && space.role !== "member";
  const notifications = snapshot?.notifications ?? [];
  const pending =
    snapshot?.memberships.filter(
      (m) => m.spaceId === space?.id && m.status === "pending",
    ).length ?? 0;

  useEffect(() => {
    const updatePage = () => {
      const raw = window.location.hash.slice(1);
      const hash = raw === "machines" ? "washers" : raw;
      if (navigation.some((n) => n.id === hash)) setPage(hash as Page);
    };
    updatePage();
    window.addEventListener("hashchange", updatePage);
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      setInviteCode(code);
      setDialog("join");
    }
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  function selectSpace(id: string) {
    setSpaceId(id);
    setPage("washers");
    window.location.hash = "washers";
  }
  async function manualRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }
  function onCreated(id: string) {
    selectSpace(id);
    setDialog(null);
  }

  return (
    <>
      <Notice />
      {loading ? (
        <div className="full-screen-loading">
          <Brand />
          <Spinner text="Alanların hazırlanıyor…" />
        </div>
      ) : !profile ? (
        <AuthScreen />
      ) : !snapshot ? (
        <div className="full-screen-loading">
          <Brand />
          <EmptyState
            title="Alan bilgileri yüklenemedi"
            text="Bağlantını kontrol edip yeniden dene."
          >
            <Button
              onClick={() => {
                void refresh();
              }}
            >
              Yeniden dene
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void signOut();
              }}
            >
              Çıkış yap
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="app-layout">
          <aside className="sidebar">
            <a className="brand-link" href="#washers">
              <Brand small />
            </a>
            <div className="space-picker">
              <label htmlFor="space-select">AKTİF ALAN</label>
              {spaces.length > 0 ? (
                <div className="space-select-wrap">
                  <Building2 size={18} />
                  <select
                    id="space-select"
                    value={space?.id ?? ""}
                    onChange={(event) => selectSpace(event.target.value)}
                  >
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </div>
              ) : (
                <span className="muted small">Henüz bir alanın yok.</span>
              )}
              {space && (
                <span className="space-role">
                  <ShieldCheck size={13} />
                  {active ? roleLabels[space.role] : "Erişim onayı gerekiyor"}
                </span>
              )}
            </div>
            {active && (
              <nav aria-label="Ana menü">
                <span className="nav-label">
                  {admin ? "YÖNETİM" : "ÇAMAŞIRHANEM"}
                </span>
                {navigation
                  .filter((item) => !item.admin || admin)
                  .map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`nav-item ${item.id === "dryers" ? "nav-dryer" : ""} ${page === item.id ? "selected" : ""}`}
                      aria-current={page === item.id ? "page" : undefined}
                      onClick={() => setPage(item.id)}
                    >
                      <item.icon size={19} />
                      <span>{item.label}</span>
                      {item.id === "members" && pending > 0 && (
                        <span className="nav-count">{pending}</span>
                      )}
                    </a>
                  ))}
              </nav>
            )}
            <div className="sidebar-actions">
              <button onClick={() => setDialog("join")}>
                <KeyRound size={17} /> Alana katıl
              </button>
              <button onClick={() => setDialog("create")}>
                <Plus size={17} /> Yeni alan oluştur
              </button>
            </div>
            <div className="sidebar-bottom">
              {client?.mode === "demo" && (
                <div className="sidebar-demo">
                  <span className="demo-dot" />
                  <div>
                    <strong>Sunum modu</strong>
                    <span>Veriler bu tarayıcıda</span>
                  </div>
                </div>
              )}
              <div className="sidebar-user">
                <span className="avatar">
                  {profile.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <span>{profile.email}</span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Çıkış yap"
                  title="Çıkış yap"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </aside>
          <div className="app-main">
            <header className="topbar">
              <div className="breadcrumb">
                <span>ÇamaşırSırası</span>
                <span>/</span>
                <strong>{space?.name ?? "Alanlarım"}</strong>
              </div>
              <div className="topbar-actions">
                <span className="topbar-date">
                  {new Intl.DateTimeFormat("tr-TR", {
                    day: "numeric",
                    month: "long",
                    timeZone: "Europe/Istanbul",
                  }).format(new Date())}
                </span>
                <button
                  className="icon-button"
                  aria-label="Verileri yenile"
                  title="Verileri yenile"
                  disabled={refreshing}
                  onClick={() => {
                    void manualRefresh();
                  }}
                >
                  <RefreshCw size={18} className={refreshing ? "spin" : ""} />
                </button>
                <div className="notifications-wrap">
                  <button
                    className="icon-button notification-button"
                    aria-label="Bildirimler"
                    aria-expanded={notificationsOpen}
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                  >
                    <Bell size={19} />
                    {notifications.length > 0 && <span />}
                  </button>
                  {notificationsOpen && (
                    <section className="notifications-popover">
                      <div className="panel-header">
                        <h3>Bildirimler</h3>
                        <span className="count">{notifications.length}</span>
                      </div>
                      {notifications.length === 0 ? (
                        <p className="notification-empty">Yeni bildirim yok.</p>
                      ) : (
                        notifications.slice(0, 8).map((n) => (
                          <article key={n.id}>
                            <strong>{n.title}</strong>
                            <p>{n.body}</p>
                            <small>{dateTime(n.createdAt)}</small>
                          </article>
                        ))
                      )}
                    </section>
                  )}
                </div>
              </div>
            </header>
            <main className="page-content">
              {!space ? (
                <Onboarding
                  onJoin={() => setDialog("join")}
                  onCreate={() => setDialog("create")}
                />
              ) : !active ? (
                <MembershipGate space={space} />
              ) : page === "washers" || page === "dryers" ? (
                <MachinesPage
                  key={`${space.id}-${page}`}
                  space={space}
                  machineType={page === "dryers" ? "dryer" : "washer"}
                />
              ) : page === "reservations" ? (
                <ReservationsPage key={space.id} space={space} />
              ) : page === "members" && admin ? (
                <MembersPage key={space.id} space={space} />
              ) : page === "invites" && admin ? (
                <InvitesPage key={space.id} space={space} />
              ) : page === "rules" && admin ? (
                <RulesPage key={space.id} space={space} />
              ) : (
                <MachinesPage
                  key={space.id}
                  space={space}
                  machineType="washer"
                />
              )}
            </main>
            <footer className="app-footer">
              <span>ÇamaşırSırası · Ortak kullanım, düzenli sıra.</span>
              <span>
                <ShieldCheck size={13} /> Alan bazında güvenli erişim
              </span>
            </footer>
          </div>
        </div>
      )}
      {profile && dialog && (
        <Modal
          title={dialog === "join" ? "Bir alana katıl" : "Yeni alan oluştur"}
          description={
            dialog === "join"
              ? "Yönetimin sana verdiği davet koduyla başvur."
              : "Mekânının kendi özel çamaşırhane alanını aç."
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "join" ? (
            <JoinForm initialCode={inviteCode} onDone={() => setDialog(null)} />
          ) : (
            <CreateSpaceForm onDone={onCreated} />
          )}
        </Modal>
      )}
    </>
  );
}

function Onboarding({
  onJoin,
  onCreate,
}: {
  onJoin: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="onboarding">
      <span className="section-kicker">HOŞ GELDİN</span>
      <h1>Çamaşırhaneni bulalım.</h1>
      <p>
        Kendi yönetiminden aldığın davetle katıl veya yönettiğin mekân için yeni
        bir alan oluştur.
      </p>
      <div className="onboarding-grid">
        <article className="panel">
          <span className="onboarding-icon">
            <KeyRound size={29} />
          </span>
          <h2>Bir alana katıl</h2>
          <p>
            Yurt, apartman veya işletmenin davet kodunu gir. Yönetici
            doğrulamasından sonra sıranı ayır.
          </p>
          <Button onClick={onJoin}>
            Davet kodunu gir <ArrowRight size={17} />
          </Button>
        </article>
        <article className="panel">
          <span className="onboarding-icon">
            <Building2 size={29} />
          </span>
          <h2>Kendi alanını aç</h2>
          <p>
            Makineleri ekle, kuralları belirle ve kullanım izni verdiğin
            kişilerin başvurularını onayla.
          </p>
          <Button variant="secondary" onClick={onCreate}>
            Alan oluştur <Plus size={17} />
          </Button>
        </article>
      </div>
      <p className="onboarding-note">
        <ShieldCheck size={17} /> Alanlar özel tutulur. İsimle arama veya
        onaysız katılma yoktur.
      </p>
    </div>
  );
}

function MembershipGate({ space }: { space: Space }) {
  const { refresh } = useLaundry();
  const pending = space.membershipStatus === "pending";
  return (
    <div className="membership-gate">
      <span className="gate-icon">
        {pending ? <Clock3 size={38} /> : <ShieldCheck size={38} />}
      </span>
      <StatusBadge status={space.membershipStatus} />
      <h1>
        {pending ? "Yönetici onayı bekleniyor" : "Bu alana erişimin kapalı"}
      </h1>
      <p>
        <strong>{space.name}</strong>
        {pending
          ? " alanına başvurun iletildi. Yönetici sakin kaydını doğrulayıp onayladığında makineleri ve rezervasyonları görebileceksin."
          : " alanının üyelik durumunu yönetiminle görüşebilirsin. Bu alandaki makineler ve rezervasyon işlemleri şu an kapalı."}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          void refresh();
        }}
      >
        <RefreshCw size={17} /> Üyelik durumunu yenile
      </Button>
      <div className="gate-explanation">
        <ShieldCheck size={20} /> Davet kodu üyelik onayı yerine geçmez.
        Yönetici onayı tüm alan verilerini korur.
      </div>
    </div>
  );
}
