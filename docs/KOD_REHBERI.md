# ÇamaşırSırası: kodu okuyup anlatma rehberi

Bu rehber uygulamanın mevcut kaynaklarına dayanır. Dosyaları sırayla açıp bir kullanımın nereden geçtiğini takip etmek için hazırlanmıştır.
Genel kapsam ve canlı adres [README](../README.md), sunum akışı [SUNUM](SUNUM.md), tablo ayrıntıları [VERİTABANI](VERITABANI.md) belgesindedir.

## Uygulama şu anda ne yapıyor?

- Her yurt, apartman veya işletme kendi özel çamaşırhane alanını açabilir.
- Kullanıcı davet koduyla başvurur; yönetici doğrulayıp onaylamadan makineleri kullanamaz.
- Çamaşır ve kurutma makineleri ayrı ekranlarda gösterilir; aynı rezervasyon kuralları uygulanır.
- Yönetici makine, program ve kullanım kurallarını ekler; her makinenin QR etiketi vardır.
- Üye uygun saati ayırabilir veya uygun makinede QR ile doğrudan kullanım açabilir.
- Sayaç tahmini bitişi gösterir; süre dolunca makine çamaşırların alınmasını bekler.
- Boşalan makine için bildirim takibi veya süreli teklif veren bekleme sırası kullanılabilir.
- Bir alanda iki türün toplamında yalnız bir aktif kullanım, rezervasyon veya sıra hakkı vardır.

## Hangi klasör ne işe yarıyor?

| Bölüm | Görevi | İlk açılacak dosya |
| --- | --- | --- |
| Mobil | React Native/Expo ile telefon ekranları, kamera ve oturum | [App.tsx](../apps/mobile/App.tsx) |
| Next.js web | TypeScript ile yönetim ve kullanım ekranları | [page.tsx](../apps/web/src/app/page.tsx) |
| Streamlit web | Canlı yayındaki Python arayüzü | [streamlit_app.py](../streamlit_app.py) |
| Ortak TypeScript kodu | Mobil ve Next.js'in veri biçimleri ve sunucu çağrıları | [types.ts](../packages/core/src/types.ts) |
| Veritabanı | PostgreSQL tabloları, izinler, sıra ve zaman kuralları | [bootstrap.sql](../supabase/migrations/20261010133016_bootstrap.sql) |
| Kontroller | Hatalı veya yetkisiz davranışları deneyen testler | [backend_security.sql](../supabase/tests/backend_security.sql) |

Mobil ve Next.js aynı TypeScript paketiyle çalışır. Streamlit bu paketi doğrudan çalıştırmaz; kendi Python istemcisiyle aynı SQL işlemlerini çağırır.
GitHub kaynakları saklar. Yayın sunucusu arayüzü çalıştırır. Kalıcı ortak veriler Supabase PostgreSQL'de tutulur.
Android Studio'da açılan `apps/mobile/android` klasörü Expo'dan üretilen native projedir; uygulama ekranlarının asıl kaynağı `.tsx` dosyalarıdır.

## Kodu okumaya nereden başlayayım?

1. [types.ts](../packages/core/src/types.ts): `Machine`, `Program`, `Reservation`, `Membership`, `Snapshot` ve `LaundryClient` biçimlerini gör.
2. [MachinesScreen.tsx](../apps/mobile/src/screens/MachinesScreen.tsx): makine listesini, programları ve rezervasyon formunu incele.
3. [MachineScan.tsx](../apps/mobile/src/components/MachineScan.tsx): QR'nin nasıl çözüldüğünü ve kullanım formuna geçtiğini izle.
4. [remote.ts](../packages/core/src/remote.ts): ekran işleminden `cs_command` çağrısına geçişi bul.
5. [QR güvenliği migration'ı](../supabase/migrations/20261010213257_keep_machine_qr_codes_private.sql): `resolveMachine` ve `startWalkIn` dallarını oku.
6. [QueueScreen.tsx](../apps/mobile/src/screens/QueueScreen.tsx): aktif kullanım, teklif ve `finishUsage` işlemini takip et.
7. [machines.ts](../packages/core/src/machines.ts): `machineCode`, `countdown` ve `activeMachines` yardımcılarını incele.

`Migration` yeni veritabanı sürümüne geçiş dosyasıdır; dosyalar tarih sırasıyla uygulanır.
Sonraki migration bazı eski fonksiyonları yeniden tanımlar. Yalnız ilk SQL dosyasını okumak güncel davranışın tamamını göstermez.
Örneğin `private.cs_command_v1` ve tür bilgisi içeren güncel snapshot [tür ayrımı migration'ında](../supabase/migrations/20261010215311_separate_washers_and_dryers.sql) bulunur.

## Bir QR kullanımının kod yolculuğu

### 1. QR etiketi oluşturulur

Yönetici makine ekler. Veritabanındaki `private.cs_create_machine_code()` makineye rastgele bir kod üretir.
Kod `private.cs_machine_codes` tablosunda tutulur; normal üyenin makine listesinde yayımlanmaz.
[machineLink()](../packages/core/src/machines.ts) bu koddan `camasirsirasi://machine?code=...` bağlantısı üretir.
[qr-label.tsx](../apps/web/src/components/qr-label.tsx) Next.js webde etiketi QR olarak gösterir ve indirmeyi sağlar.

### 2. Telefon kodu okur, makineyi bulur

[MachineScan](../apps/mobile/src/components/MachineScan.tsx) kamera izniyle QR okur; elle kod girme seçeneği de vardır.
`machineCode()` yalnız beklenen makine bağlantısını veya kod biçimini kabul eder.
`client.resolveMachine(code)` → `command('resolveMachine', ...)` → Supabase `cs_command` çağrısı yapılır.
Sunucu kullanıcının aktif alan üyeliğini denetler; QR üyelik veya erişim yetkisi vermez.
Yanıt yalnız hangi makine/alanın bulunduğunu söyler. QR okumak kullanım kaydı oluşturmaz.

### 3. Program seçilir ve başlangıç onaylanır

Kullanıcı kayıtlı programı seçer; süre ve tahmini bitiş görünür.
"Makineyi fiziksel olarak başlattım" onayı verildiğinde ekran `client.startWalkIn(code, programId)` çağırır.
[remote.ts](../packages/core/src/remote.ts) bunu şu sunucu isteğine çevirir:

```ts
supabase.rpc("cs_command", {
  p_action: "startWalkIn",
  p_payload: { machineQr: code, programId },
});
```

`RPC`, sunucuda tanımlı bir fonksiyonu çağırmaktır. Süre istemciden serbestçe gönderilmez; sunucu kayıtlı programın süresini kullanır.
Checkbox kullanıcı beyanıdır; uygulama donanımla makinenin çalıştığını ölçmez.

### 4. Sunucu işlemi kabul eder veya reddeder

[private.cs_command()](../supabase/migrations/20261010213257_keep_machine_qr_codes_private.sql) kimlik, doğrulanmış e-posta ve üyelik kontrolünü yapar.
`private.cs_lock()` aynı alandaki eşzamanlı işlemleri işlem süresince sıraya koyar.
Makinenin boşluğu, programın o makineye ait olması, tek hak, kota, çalışma saatleri ve sonraki rezervasyonla çakışma kontrol edilir.
Bekleyen sıraya teklif verilmesi `private.cs_tick()` içinde değerlendirilir; QR ile sıranın önüne geçilemez.
Uygun kendi rezervasyonu varsa `startUsage` ile o kayıt başlatılır; ikinci hak oluşturulmaz.
Başarılı yeni kullanımda rezervasyon ve makine güncellenir; `estimated_end_at` sunucu saatinden hesaplanır.
Tablo izinleri/RLS ve zaman aralığı kısıtı da koruma sağlar; yalnız ekrandaki düğmeyi kapatmaya güvenilmez.

### 5. Sayaç ve teslim alma

[useLaundry()](../apps/mobile/src/hooks/useLaundry.ts) güncel `Snapshot` verisini alır. Ortak istemci Realtime ve 30 saniyelik yenileme, mobil hook ayrıca 20 saniyelik zaman kontrolü kullanır.
[useClock()](../apps/mobile/src/hooks/useClock.ts) ekran açıkken saati yeniler; `countdown(estimatedEndAt, now)` kalan süreyi hesaplar.
`activeMachines()` kullanılan makineleri kalan süre çoktan aza olacak şekilde sıralar.
[private.cs_tick()](../supabase/migrations/20261010181615_harden_runtime.sql) süre bitince makineyi `awaiting_pickup` durumuna geçirir.
[Cron migration'ı](../supabase/migrations/20261010181948_schedule_timers.sql) bu zaman işlemlerini dakikada bir çalıştırır; istemci de `refreshTimers` çağırır.
Kullanıcı çamaşırlarını aldığını onaylayınca `finishUsage(reservationId)` sunucuya gider.
Yetkili işlem sonunda makine boşalır; varsa uygun sıradaki kişiye süreli teklif ve takipçiye uygulama içi bildirim oluşur.

## Canlı Streamlit sürümünde karşılıkları

[streamlit_app.py](../streamlit_app.py) yalnız `main()` çağırır. Ekran kodu [web.py](../apps/streamlit/web.py) dosyasındadır.
`auth_page()` giriş/kayıt, `machines_page()` türlere göre liste, `scan_dialog()` QR/program, `queue_page()` kullanım ve teslim ekranıdır.
[client.py](../apps/streamlit/client.py) içindeki `LaundryClient.command()` aynı `cs_command` fonksiyonuna gider; `snapshot()` görünür verileri alır.
Her tarayıcı oturumu ayrı istemci kullanır. Sayaç saniyelik, ana veri 30 saniyelik Streamlit fragment yenilemesiyle güncellenir.
Streamlit'te makine kodu/QR bağlantısı girilir; uygulama içindeki kamera taraması mobil sürümdedir.

## Derste 5 dakikalık gösterim

1. Problemi anlat; alan, yönetici ve üye kavramlarını göster.
2. Next.js webi `?demo=1` ile aç; bekleyen üyede kullanımın kapalı olduğunu göster.
3. Yöneticiyle üyelik onayı ve makine/program ekranını göster; Çamaşır/Kurutma ayrımını aç.
4. QR → program → fiziksel onay → sayaç → teslim akışını yukarıdaki dört dosyada takip et.
5. "Boşalınca haber ver" ile "Sıra iste" farkını açıkla: ilki bildirimdir, ikincisi aktif hak tutar.
6. İkinci makine talebinin, yanlış QR'nin ve çakışan saatin neden reddedildiğini anlat.

Demo hesabı `owner@demo.local` / `demo12345`; üye `member@demo.local` / `demo12345`.
Bu hesaplar yalnız demo içindir; canlı Streamlit'te gerçek uygulama hesabı gerekir.
Demoda veriler cihazdadır; canlı sürümde farklı kullanıcılar aynı Supabase verisini görür.

## Mevcut sınırlar ve sonraki işler

- Android test APK'sı ve emülatör açılışı doğrulanmıştır; iPhone fiziksel cihaz testi ve mağaza paketleri ayrıca gerekir.
- Bildirimler uygulama içidir. Uygulama kapalıyken telefon bildirim çubuğuna push gönderilmez.
- QR fiziksel varlık kanıtı değildir; fotoğrafı paylaşılabilir. Makineyi uzaktan başlatmaz.
- Yeni işlem için internet gerekir. Sayaç donanım ölçümü değil, seçilen programa göre tahmindir.
- Canlı web Streamlit adresindedir; Render yayını bu rehberin oluşturulduğu anda henüz doğrulanmış değildir.
- Kurum doğrulama rozeti, üyelik bitiş tarihi, gelişmiş raporlar ve makine donanım entegrasyonu sonraki aşamalardır.

Davranış kanıtları: [yerel testler](../tests/backend.test.mjs), [QR SQL testi](../supabase/tests/qr_walk_in.sql), [tür SQL testi](../supabase/tests/machine_types.sql), [Streamlit testleri](../apps/streamlit/tests/test_web.py).
Kontrol komutları ve kurulumu [README](../README.md) ile [STREAMLIT](STREAMLIT.md) belgesinden takip et.
