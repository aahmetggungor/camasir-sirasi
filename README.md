# ÇamaşırSırası

Ortak çamaşırhaneler için **Android/iPhone mobil uygulaması**, ayrı **web yönetim paneli** ve ortak **Supabase PostgreSQL** altyapısı.

Bu repo Ahmet Güngör'ün laptopunda geliştirilir. Proje klasörü: `C:\Users\rog\Documents\Projects\CamasirSirasi`. Kaynaklar VS Code'da; üretilen Android projesi Android Studio'da açılır.

## Çalıştırma

```powershell
npm install
npm run web
# Ayrı terminalde:
npm run mobile
```

- Web: http://localhost:3000
- Sunum: http://localhost:3000/?demo=1 — yalnız örnek verilerle çalışır.
- Mobil: Expo terminalindeki QR veya Android emülatörü. SDK 57 ile uyumlu Expo istemcisi/development build gerekir.
- Yerel Android projesi: `cd apps/mobile; npx expo prebuild --platform android --no-install`. Android Studio'da `apps/mobile/android` klasörünü aç.
- Windows üzerinde iOS Simulator/native iOS derlemesi yoktur; kaynak kod ortaktır. iPhone'da fiziksel cihaz/Expo veya EAS build ile test edilir.

VS Code'da **Terminal → Run Task** menüsünde web, mobil, Android hazırlama ve kontroller için hazır görevler bulunur.

Bu laptopta Android release paketinin derlemesi ve API 34 emülatöründe açılması doğrulanmıştır. Yerel APK, test amaçlı debug imzasını kullanır; mağaza yayını için kullanıcıya ait üretim imzası ve mağaza hesabı gerekir. İlk sürümün JavaScript'i paketin içindedir, Metro sunucusu olmadan açılır. Çevrim içi işlemler için internet gerekir.

## Veritabanı bağlantısı

Yerel `.env` dosyaları bu laptopta hazırlanmıştır ve Git'e dahil edilmez. Başka bilgisayarda ilgili `.env.example` dosyasını kopyalayıp kendi proje URL/publishable key değerlerini doldur.

| Uygulama | Dosya                 | Değerler                                                           |
| -------- | --------------------- | ------------------------------------------------------------------ |
| Web      | `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Mobil    | `apps/mobile/.env`    | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

`service_role`, veritabanı şifresi veya başka sunucu sırrı istemciye eklenmez. Supabase panel hesabı ile uygulamanın kullanıcı hesabı farklıdır; uygulamada kayıt ol, e-postanı doğrula, giriş yap ve özel alanını oluştur.

Supabase şeması `supabase/migrations` altındadır. Bağlı projede migration'lar uygulanmış ve dakikada bir `private.cs_run_timers()` çalıştıran Cron kurulmuştur. Yeni projede migration dosyaları sıra ile uygulanır. E-posta doğrulamasının kurum kullanıcılarına teslimi için Supabase Auth SMTP ayarı ayrıca yapılandırılmalıdır.

## İlk sürümde çalışan akışlar

- Hesap/giriş, e-posta doğrulama kontrolü, özel alan oluşturma ve alan seçimi.
- Davet kodu ile başvuru; onay bekleyen/engellenen kullanıcıda makinelere erişimin kapalı olması.
- Yetkili yöneticinin sakin kontrolüyle üyeyi onaylaması, reddetmesi veya erişimini kapatması.
- Makine/program ekleme, servise alma ve uygun saat seçerek rezervasyon.
- Makine QR etiketinin PNG olarak indirilmesi; mobil kamera veya kodla kullanım kaydı.
- Tahmini bitiş ile fiziksel boşalma onayının ayrı olması.
- Bekleme, boşalan yere süreli teklif, kabul/ret ve gelmeyenin hakkının bırakılması.
- Günlük/yoğun saat kotası; tek aktif hak ve çakışma kısıtları.
- Uygulama içi bildirimler ve Realtime yenileme.

Mağaza yayını, işletim sistemi push bildirimi, donanım entegrasyonu, kurum doğrulama rozeti, üye süre bitişi, yönetici atama ve gelişmiş raporlar bu sürümün kapsamında değildir. Tasarım belgelerinde sonraki geliştirme kararları da bulunduğundan, mevcut uygulama kapsamı için bu listeyi kullan.

## Sunum modu

Webde `?demo=1`; mobil web önizlemede de `?demo=1` kullanılabilir. Native demo build için `.env` içine `EXPO_PUBLIC_DEMO_MODE=true` eklenir; gerçek bağlantı için kaldırılır. Her cihazın demo verisi ayrıdır. Ortak çevrim içi kullanım Supabase bağlantısında gerçekleşir.

| Demo hesabı          | Durum                | Parola      |
| -------------------- | -------------------- | ----------- |
| `owner@demo.local`   | Yönetici/alan sahibi | `demo12345` |
| `member@demo.local`  | Aktif üye            | `demo12345` |
| `pending@demo.local` | Onay bekleyen        | `demo12345` |

Demo kişisel parola saklamaz ve gerçek Supabase hesabı üretmez.

## Kod haritası

```text
apps/mobile/           React Native ekranları, kamera, güvenli oturum deposu
apps/web/              Next.js yönetim ekranları ve QR etiketleri
packages/core/         İki uygulamanın ortak tipleri ve veri istemcisi
supabase/migrations/   Tablolar, RLS, güvenli işlemler ve Cron
supabase/tests/        Gerçek PostgreSQL izin/çakışma testleri
tests/                 Yerel demo ve güvenli depo testleri
docs/                  Tasarım, veritabanı ve sunum açıklamaları
```

`packages/core/src/types.ts` sözleşmedir. Ekranlar `LaundryClient` metotlarını çağırır. Gerçek adapter Supabase RPC'sine gider; rezervasyon ve yetki kararları PostgreSQL'de verilir. Demo adapter yalnız sunum ve yerel kontroller içindir.

## Kontroller

```powershell
npm run typecheck
npm test
npm run build:web
```

Gerçek veritabanı testi: `supabase/tests/backend_security.sql`; geçici kullanıcı/veriler sonunda `ROLLBACK` edilir. Bu test başarıyla çalıştırılmıştır; Supabase denetiminde tablo izinleri/RLS sorunu bulunmamıştır. Auth denetiminde sızmış parola korumasının kapalı olduğu uyarısı kalır. Supabase bu özelliği Pro ve üzeri planlarda sunar; mevcut Free plan yükseltilmemiştir. [Parola koruması ve yapılandırma](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Native cihaz kontrolü ile JavaScript export/TypeScript kontrolü ayrı doğrulamalardır; iPhone cihaz testi ayrıca yapılmalıdır.

Bağımlılık audit raporundaki upstream `braces`, `node-forge` ve `uuid` bildirimleri geliştirme araç zincirinde izlenmektedir. `npm audit fix --force`, Expo/Next sürümlerini geriye düşürdüğü için uygulanmaz. Mağaza sürümünden önce güncel tedarikçi düzeltmeleri kontrol edilmelidir.

Kodu sunumda anlatmak için [SUNUM.md](docs/SUNUM.md), veritabanı detayları için [VERITABANI.md](docs/VERITABANI.md) dosyasını kullan.
