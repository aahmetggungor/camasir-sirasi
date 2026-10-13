# ÇamaşırSırası

Ortak çamaşırhaneler için **Android/iPhone mobil uygulaması**, ayrı **web yönetim paneli** ve ortak **Supabase PostgreSQL** altyapısı.

**Canlı web sürümü:** [ÇamaşırSırası'nı aç](https://camasir-sirasi-ahmet.streamlit.app/).

Streamlit arayüzü Community Cloud'da yayındadır. Uygulama hesabınla giriş yapabilir veya kayıt olabilirsin. Alanlara erişim için ilgili alanın üyelik ve yönetici onayı kuralları geçerlidir.

**Streamlit kaynakları:** Python arayüzü `apps/streamlit/` klasöründedir; başlangıç dosyası repo kökündeki `streamlit_app.py` dosyasıdır. Yerel çalıştırma, Cloud ayarları ve kapsam için [STREAMLIT.md](docs/STREAMLIT.md).

Bu repo Ahmet Güngör'ün laptopunda geliştirilir. Proje klasörü: `C:\Users\rog\Documents\Projects\CamasirSirasi`. Kaynaklar VS Code'da; üretilen Android projesi Android Studio'da açılır.

## Kodları açıp inceleme

- **VS Code → File → Open Folder:** `C:\Users\rog\Documents\Projects\CamasirSirasi` klasörünü aç. Bütün kaynaklar aynı projede görünür.
- **Android Studio → Open:** `apps/mobile/android` klasörünü aç. Bu klasör Android derlemesini içerir; telefon ekranlarının asıl kodları `apps/mobile/App.tsx` ve `apps/mobile/src` içindedir. Yalnız kod incelemek için emülatör açmak gerekmez.
- Dosya görevleri ve örnek bir kullanımın kodda izlediği yol için [KOD_REHBERI.md](docs/KOD_REHBERI.md) dosyasından başla.
- GitHub üzerinden Next.js web arayüzünü Render'da yayınlamak için [RENDER.md](docs/RENDER.md) ve kökteki `render.yaml` hazırdır. Render yayını henüz yapılmamıştır; mevcut canlı adres Streamlit sürümüdür.

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

**1.0.2 — Çamaşır / Kurutma:** Web menüsü ve mobil sekmeler ayrıdır. Her bölüm yalnız kendi türünü ve o türe ait aktif sayaçları gösterir. Çamaşırda mavi, kurutmada hafif amber vurgu ve açık tür etiketi vardır. İlgili bölümde makine eklemek doğru türü kaydeder; kurutma programları ayrı tanımlanır. Kurutma da QR, hızlı başlatma, rezervasyon, program ekleme, geri sayım, bildirim takibi, FIFO teklifi, bakım ve teslim akışlarının tamamını kullanır.

Mevcut makine kayıtları çamaşır türü olarak korunur. Eski istemcilerin tür belirtmeden oluşturduğu kayıtlar da çamaşırdır. Tek aktif hak ve günlük kota **alan genelinde iki tür için ortak** kalır; yıkamayı teslim ettikten sonra kurutma hakkı alınabilir. Tür ayrımı ikinci aktif hak yaratmaz. Yeni SQL regresyonu: `supabase/tests/machine_types.sql`.

- Hesap/giriş, e-posta doğrulama kontrolü, özel alan oluşturma ve alan seçimi.
- Davet kodu ile başvuru; onay bekleyen/engellenen kullanıcıda makinelere erişimin kapalı olması.
- Yetkili yöneticinin sakin kontrolüyle üyeyi onaylaması, reddetmesi veya erişimini kapatması.
- Makine/program ekleme, servise alma ve uygun saat seçerek rezervasyon.
- Makine QR etiketinin PNG olarak indirilmesi; mobil kamera veya kodla kullanım kaydı.
- Tahmini bitiş ile fiziksel boşalma onayının ayrı olması.
- Bekleme, boşalan yere süreli teklif, kabul/ret ve gelmeyenin hakkının bırakılması.
- Günlük/yoğun saat kotası; tek aktif hak ve çakışma kısıtları.
- Uygulama içi bildirimler ve Realtime yenileme.

## QR ile hızlı kullanım — 1.0.1

Yönetici makineyi ve programlarını kaydeder; **Makine kodu** ekranından her makineye ait QR etiketi indirilir. Yeni etiketin içeriği `camasirsirasi://machine?code=...` biçimindedir. Kurulu mobil uygulamanın makine formunu açar. Uygulama içindeki üst menü QR düğmesiyle de okutulabilir; eski düz makine kodları geçerlidir. Bu QR üyelik vermez. Android/iPhone kamera taraması yalnız kullanıcı kamera izni verdiğinde çalışır; cihaz kamerasıyla bağlantıyı açma desteği okuyucu uygulamaya göre değişebilir.

QR okut → yetkili makine bulunur → program kısayolu seçilir → süre ve tahmini bitiş görünür → kullanıcı fiziksel başlatmayı onaylar → tek işlemde kullanım kaydı açılır. Önceden rezervasyon gerekiyorsa o hak kullanılır; rezervasyonsuz kullanım da mevcut sıraya, sonraki rezervasyona, kapanışa ve kotaya uymalıdır. Okutmak tek başına kullanım yazmaz. Mevcut rezervasyon aynı makine/programa aitse yeni hak yaratmadan başlatılır.

**Aktif makineler** kalan süre çoktan aza sıralanır; sayaç her saniye bitiş zaman damgasından yeniden hesaplanır. Tahmini süre dolduğunda makine teslim bekler ve kullanıcıya uygulama içi hatırlatma kaydedilir. Çamaşırlar alınmadan boş sayılmaz.

- **Boşalınca haber ver:** 24 saat geçerli tek seferlik takip; fiziksel teslim onayında uygulama içi bildirim. Hak ayırmaz. İptal edilebilir; üyelik kapatılırsa silinir.
- **Sıra iste:** seçilen makine/program için FIFO sırası; boşluk sığarsa süreli teklif. Kullanıcı kabul etmelidir.
- **Tek hak:** bir çamaşırhane alanında bir kişinin en fazla bir aktif kullanım, rezervasyon veya sıra hakkı olur. Bildirim takibi hak değildir. Bu kural uygulama düğmesinden bağımsız olarak veritabanında denetlenir.
- **Program ekle:** yönetici mevcut makineye 10–240 dakika arasında kısayol ekler; en fazla 12 program. Kullanıcı rastgele süre göndererek kayıtlı programı değiştiremez. Eski rezervasyonların süreleri korunur.

Bildirimler mevcut sürümde uygulama içidir; uygulama kapalıyken telefonun bildirim çubuğuna push gönderilmez. iPhone'da fiziksel cihaz ve QR kamera testi ayrıca yapılmalıdır.

QR anahtarları özel tabloda tutulur; normal üyenin makine listesi ve Realtime makine kayıtlarında bulunmaz. Yönetici etiket üretmek için anahtarı görebilir. Sabit QR'nin fotoğrafı paylaşılabileceğinden QR tek başına fiziksel varlık kanıtı değildir; cihaz sensörü veya değişen yerinde kod gerektiren doğrulama bu sürümde yoktur.

Yeni PostgreSQL regresyonu: `supabase/tests/qr_walk_in.sql`. Yetkisiz/yanlış QR, tek hak, program yetkisi, mevcut rezervasyon/FIFO önceliği, tek seferlik hatırlatma ve takip iptali/yenilemesi gerçek veritabanında test edilir.

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
apps/streamlit/        Canlı Streamlit web arayüzü ve Supabase istemcisi
streamlit_app.py       Streamlit Community Cloud başlangıç dosyası
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
