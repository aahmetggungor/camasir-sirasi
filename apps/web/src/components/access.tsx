"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  ShieldCheck,
  WashingMachine,
} from "lucide-react";
import type { InvitePreview } from "@camasir/core";
import { useLaundry } from "@/lib/laundry";
import { Button, Field, dateTime } from "./ui";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-mark">
        <WashingMachine size={small ? 22 : 25} strokeWidth={1.8} />
      </span>
      <span>
        Çamaşır<span className="brand-accent">Sırası</span>
        <small>
          {small ? "ALAN YÖNETİMİ" : "Ortak kullanım, düzenli sıra."}
        </small>
      </span>
    </div>
  );
}

export function AuthScreen() {
  const { client, busy, signIn, signUp } = useLaundry();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const demo = client?.mode === "demo";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (register) {
      if (await signUp(name, email, password)) setRegister(false);
    } else await signIn(email, password);
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">HER ALANIN KENDİ DÜZENİ</span>
          <h1>
            Makineyi bekleme.
            <br />
            <span>Sıranı bil.</span>
          </h1>
          <p>
            Ortak çamaşırhanenin makineleri, üyeleri ve rezervasyonları tek bir
            yerde.
          </p>
          <div className="story-preview">
            <div className="story-machine">
              <WashingMachine size={45} strokeWidth={1.3} />
              <div>
                <strong>Her şey yolunda</strong>
                <span>Çamaşırhanen kontrol altında.</span>
              </div>
              <span className="story-check">
                <Check size={18} />
              </span>
            </div>
            <div className="story-features">
              <span>
                <ShieldCheck size={17} /> Onaylı üyelik
              </span>
              <span>
                <KeyRound size={17} /> Özel alan
              </span>
            </div>
          </div>
        </div>
        <p className="auth-footer">
          Yurtlar, apartmanlar ve paylaşılan tüm çamaşırhaneler için.
        </p>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="section-kicker">YÖNETİM PANELİ</span>
          <h2>{register ? "Bir hesap oluştur" : "Tekrar hoş geldin"}</h2>
          <p>
            {register
              ? "Hesabını oluştur, kendi alanını aç veya yönetiminin davetiyle katıl."
              : "Alanını yönetmek veya sıranı görmek için giriş yap."}
          </p>
          <div className="auth-tabs">
            <button
              className={!register ? "selected" : ""}
              onClick={() => setRegister(false)}
            >
              Giriş yap
            </button>
            <button
              className={register ? "selected" : ""}
              onClick={() => setRegister(true)}
            >
              Kayıt ol
            </button>
          </div>
          <form onSubmit={submit} className="form-stack">
            {register && (
              <Field label="Ad soyad">
                <input
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ahmet Güngör"
                  required
                  maxLength={100}
                />
              </Field>
            )}
            <Field label="E-posta adresi">
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ad@ornek.com"
                required
              />
            </Field>
            <Field
              label="Parola"
              hint={register ? "En az 8 karakter kullan." : undefined}
            >
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Parolanı gir"
                required
                minLength={register ? 8 : undefined}
              />
            </Field>
            <Button type="submit" disabled={!!busy || !client}>
              {busy ?? (register ? "Hesap oluştur" : "Giriş yap")}
              <ArrowRight size={18} />
            </Button>
          </form>
          <p className="auth-note">
            <ShieldCheck size={15} /> Bir alana erişim için o alanın üyelik
            onayı gerekir.
          </p>
          <p className="auth-note">
            {demo ? (
              <a href="/">Gerçek hesabımla kullan</a>
            ) : (
              <a href="/?demo=1">Örnek verilerle sunum modunu aç</a>
            )}
          </p>
          {demo && (
            <div className="demo-access">
              <div>
                <span className="demo-dot" />
                <strong>Sunum modu</strong>
              </div>
              <p>
                Gerçek hesaplara ve makinelere işlem yapmadan akışı
                deneyebilirsin. Veriler bu tarayıcıda saklanır.
              </p>
              <div className="demo-buttons">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRegister(false);
                    setEmail("owner@demo.local");
                    setPassword("demo12345");
                  }}
                  disabled={!!busy}
                >
                  Yönetici hesabı
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRegister(false);
                    setEmail("member@demo.local");
                    setPassword("demo12345");
                  }}
                  disabled={!!busy}
                >
                  Üye hesabı
                </Button>
              </div>
              <small>
                Her iki hesabın parolası: <code>demo12345</code>
              </small>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export function JoinForm({
  onDone,
  initialCode = "",
}: {
  onDone?: () => void;
  initialCode?: string;
}) {
  const { busy, run } = useLaundry();
  const [code, setCode] = useState(initialCode);
  const [room, setRoom] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  async function previewCode(event: FormEvent) {
    event.preventDefault();
    const result = await run("Davet kontrol ediliyor", (client) =>
      client.previewInvite(code.trim()),
    );
    if (result) setPreview(result);
  }
  async function request(event: FormEvent) {
    event.preventDefault();
    const result = await run(
      "Başvuru gönderiliyor",
      async (client) => {
        await client.requestMembership(code.trim(), room.trim());
        return true;
      },
      "Katılım talebin gönderildi. Yönetici onayından sonra alana erişebilirsin.",
    );
    if (result) {
      setPreview(null);
      setCode("");
      onDone?.();
    }
  }
  return (
    <div className="form-stack">
      {!preview ? (
        <form onSubmit={previewCode} className="form-stack">
          <Field
            label="Davet kodu"
            hint="Kodu kendi yurt veya mekân yönetiminden al."
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Örn. CS-…"
              required
              autoCapitalize="characters"
            />
          </Field>
          <Button type="submit" disabled={!!busy}>
            {busy ?? "Daveti kontrol et"}
            <ArrowRight size={17} />
          </Button>
        </form>
      ) : (
        <>
          <div className="invite-preview">
            <Building2 size={26} />
            <div>
              <strong>{preview.spaceName}</strong>
              <span>
                Davet {dateTime(preview.expiresAt)} tarihine kadar geçerli.
              </span>
            </div>
          </div>
          <form onSubmit={request} className="form-stack">
            <Field
              label="Oda / birim numarası"
              hint="İsteğe bağlı. Yönetici seni mevcut sakin kaydıyla doğrulayacak."
            >
              <input
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="Örn. B-204"
                maxLength={60}
              />
            </Field>
            <p className="inline-info">
              <ShieldCheck size={19} /> Davet kodu başvuru hakkı verir.
              Makinelere erişim yönetici onayından sonra açılır.
            </p>
            <Button type="submit" disabled={!!busy}>
              {busy ?? "Katılım talebi gönder"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPreview(null)}
            >
              Başka kod kullan
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

export function CreateSpaceForm({
  onDone,
}: {
  onDone: (spaceId: string) => void;
}) {
  const { busy, run } = useLaundry();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Yurt");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const id = await run(
      "Alan oluşturuluyor",
      (client) => client.createSpace(name.trim(), kind),
      "Alan oluşturuldu. İlk makineyi ekleyebilirsin.",
    );
    if (id) onDone(id);
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <Field label="Alan adı">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Örn. Kampüs Yurdu Çamaşırhanesi"
          required
          minLength={3}
          maxLength={100}
        />
      </Field>
      <Field label="Mekân türü">
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option>Yurt</option>
          <option>Apartman / site</option>
          <option>İşletme</option>
          <option>Diğer</option>
        </select>
      </Field>
      <p className="inline-info">
        <ShieldCheck size={19} /> Alanın özel olacak. Üyeler davetle başvuracak
        ve senin onayınla katılacak.
      </p>
      <Button type="submit" disabled={!!busy}>
        {busy ?? "Alanı oluştur"}
        <ArrowRight size={18} />
      </Button>
    </form>
  );
}
