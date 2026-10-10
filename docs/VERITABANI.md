# Veritabanı ve sıra sistemi

ÇamaşırSırası'nın mobil ve web uygulamaları aynı PostgreSQL veritabanını kullanır. Supabase Auth hesapları doğrular; veritabanı kullanıcının hangi alanı görebileceğine ve hangi işlemi yapabileceğine karar verir. Mobil ve web, `packages/core/src/types.ts` içindeki aynı TypeScript sözleşmesini kullanır.

## Sunumda anlatılabilecek ana fikir

Bir kullanıcı uygulamaya kaydolunca bütün çamaşırhaneleri göremez. Yönetimin verdiği davet koduyla özel bir alana **başvurur**. Davet kodu erişim yetkisi değildir. Yönetici kişiyi kendi sakin kayıtlarından veya yüz yüze doğruladıktan sonra onaylar. Ancak aktif üyelik rezervasyon ve QR kullanım hakkı verir. Yönetim kişinin ayrıldığını bildirdiğinde erişim hemen kesilir; eski kodla kendisini yeniden açamaz.

Yurt, apartman veya işletme başına ayrı fiziksel sunucu kurulmaz. Her kayıt bir `space_id` taşır; alanlar aynı altyapıda ayrı yetki sınırlarına sahiptir. Kullanıcı birkaç alana üye olabilir ve her alanda farklı bir rol taşıyabilir.

## Tablolar

| Tablo | Amaç |
|---|---|
| `auth.users` | Supabase'in yönettiği hesap, e-posta doğrulama ve kimlik |
| `cs_profiles` | Görünen ad ve doğrulanmış hesaptan alınan e-posta |
| `cs_spaces` | Mekân, sahibi, saat dilimi ve kullanım kuralları |
| `cs_memberships` | Kullanıcı–alan ilişkisi, rol, onay durumu, doğrulayan yönetici |
| `private.cs_invites` | Davetin SHA-256 özeti, son kullanma zamanı ve iptal durumu |
| `cs_machines` | Makinenin fiziksel durumu, QR tokenı ve o anki kullanım |
| `cs_programs` | Makineye ait program ve tahmini dakika |
| `cs_reservations` | Kullanıcı, makine, program, tutulan zaman bloğu ve kullanım durumu |
| `cs_waitlist` | Programa bağlı FIFO bekleme sırası ve kullanıcının uygunluk bitişi |
| `cs_offers` | Sıradaki kişiye tutulan yerin zaman sınırlı teklifi |
| `cs_notifications` | Kişiye özel uygulama içi bildirimler |

Üyelikler `pending → active` olarak açılır. `rejected`, `removed`, `blocked` durumlarının hiçbirinde kullanıcı kendisini yeniden aktif edemez. İlk sürüm yönetici onayı/reddi ve engelleme sunar; sahiplik devri ve yönetici atama ayrı bir sonraki sürüm işidir.

## Uygulamadan çağrılan API

`createLaundryClient({ url, publishableKey, storage })` gerçek Supabase istemcisini oluşturur. Mobil, URL callback algılamasını kapatmak için `detectSessionInUrl: false` verir. Bu parametreler birlikte boşsa uygulama açıkça **yerel demo** moduna girer. Birinin eksik olması hata verir; bozuk gerçek bağlantı sessizce demoya dönmez.

Hesap işlemleri Supabase Auth'a gider. Diğer komutlar iki PostgreSQL RPC üzerinden yürür:

```ts
await supabase.rpc('cs_command', {
  p_action: 'reserve',
  p_payload: { machineId, programId, startsAt },
});
await supabase.rpc('cs_snapshot');
```

`p_action` adı ortak istemcideki yöntem adıyla aynıdır. Payload anahtarları camelCase'tir. `createSpace` ve `reserve` ID döndürür; `createInvite` kod ve bitişi; `previewInvite` alan adı ve davet bitişini; `getAvailability` saat listesini döndürür. Diğer komutların sonucu `null`dır. Snapshot sözleşmesi `types.ts` ile aynıdır.

## Güvenlik neden arayüzde değil veritabanında?

Bir kullanıcının telefondaki kodu değiştirebileceğini varsayarız. Bu yüzden istemciye üyelik/rol güncelleme veya doğrudan rezervasyon yazma izni verilmez. Açık `public` tablolarda RLS aktiftir ve istemci yalnız izin verilen satırları okuyabilir. Yazılar tek bir guarded RPC işleminde yapılır.

- Kimlik `auth.uid()` ile alınır; payload'daki kullanıcı kimliğine güvenilmez.
- Giriş ve doğrulanmış e-posta gereklidir. İzinler, kullanıcı tarafından düzenlenebilen `user_metadata` içinden okunmaz; canlı üyelik kaydı her işlemde tekrar kontrol edilir.
- Alt kaydın gerçek alanı, veritabanındaki ilişkiden bulunur; gönderilen başka bir `spaceId` erişim sağlayamaz.
- Üye yalnız kendi üyeliğini/e-postasını, alanın makine durumunu ve rezervasyon doluluğunu görür. Yönetici kendi alanının üye listesini görebilir.
- Bekleme listesi ve teklifler ilgili kişiyle yöneticilerine açıktır; bildirimler kişiye özeldir.
- Public RPC fonksiyonları `SECURITY INVOKER`dır. Yetkili yazma ve RLS'in recursive üyelik kontrolü, API'de açılmayan `private` şemadaki `SECURITY DEFINER` fonksiyonlarda yapılır. Bu fonksiyonlar kimliği kontrol eder; sabit boş `search_path` ve açık şema adları kullanır. `PUBLIC`/`anon` çalıştırma hakları iptaldir.
- İstemcilere yalnız publishable key verilir. `service_role`, secret key veya veritabanı parolası uygulamada bulunmaz.

Davet kodları 96 bit rastgele değerden oluşturulur; yalnız hash saklanır. Kod 7 günde dolar. Yönetici yeni davet oluşturunca önceki kodlar iptal edilir. QR ile davet de aynı başvuru işlevini kullanır. Makine QR'ı ayrı bir değerdir. Statik QR fiziksel yakınlığı kesin kanıtlayamaz; ilk sürümde üyelik, rezervasyon, doğru makine ve zaman kontrolüyle **kullanım kaydı** başlatır. Makineyi fiziksel panelinden kullanıcı çalıştırır.

Bir alana kurumun adını yazmak kurumun resmî kimliğini kanıtlamaz. Pilot alanın sahibi gerçek yönetimle doğrulanmalı; doğru davet yönetimin kendi kanalından dağıtılmalıdır.

## Yarış koşulları ve kullanım hakkı

Bir işlem sırasında alanın advisory transaction lock'u alınır. Bu lock aynı anda iki farklı makineye yapılan istekleri de sıraya koyarak kullanıcı kotasının aşılmasını önler. İlk sürüm ölçeğinde tenant başına bir kısa işlem yeterlidir. İleride ölçüm sonucunda makine + kullanıcı bazlı daha dar lock'lara geçilebilir.

Ayrıca PostgreSQL `EXCLUDE USING GIST` kısıtı, aynı makinenin `offered`, `confirmed`, `running` zaman aralıklarının çakışmasını engeller. Zaman aralıkları `[başlangıç, bitiş)` olarak tutulur; bir kullanımın bitişinde yenisi başlayabilir. Bu, arayüz güncel olmasa bile veritabanının çifte rezervasyonu reddetmesini sağlar.

Bir kullanıcı alan başına yalnız bir mantıksal hak tutar:

```text
Bekleme → süreli teklif → kabul edilmiş rezervasyon → devam eden kullanım
```

Bekleme kaydı `offered` olduğunda aynı teklif için tutulan rezervasyon ikinci bir kullanıcı hakkı değildir. Teklif kabulünde bekleme `accepted` olur. Reddedilen/bitmiş teklif slotu bırakır ve kota cezası yaratmaz; yeni bir bekleme talebi gerekir. FIFO sıra, aynı makine/programı isteyen uygun kişiler arasında değerlendirilir; kişi programını seçerek kuyruğa katılır.

## Süreler ve fiziksel makine durumu

Normal rezervasyon bloğu `program + başlangıç toleransı + teslim alma tamponu`dur. Teklif bloğu `teklif kabul süresi + geliş toleransı + program + tampon`dur. Bütün blok sonraki onaylı rezervasyona ve çalışma saatlerine sığmalıdır. Bir yıkama erken teslim alındığında yalnız tamamen sığan program için teklif yapılır; sonraki onaylanmış saat kaydırılmaz.

Varsayılan başlangıç toleransı 5, teslim tamponu 10, teklif süresi 2 ve kabul sonrası geliş toleransı 5 dakikadır. Yönetici bu değerleri değiştirebilir. Günlük ve yoğun saat kotası alanın yerel tarihine göre hesaplanır. İlk sürüm alan saat dilimi `Europe/Istanbul`dur. Programlar 10–240 dakika arasındadır; örnek süreler makine üreticisinin gerçek programlarına göre yönetici tarafından ayarlanmalıdır.

Makine durumları:

```text
available → running → awaiting_pickup → available
                                  ↘ yönetici teslim onayı
out_of_order / needs_check → yönetici kontrolü → available
```

Tahmini bitişin gelmesi makineyi boşaltmaz; `awaiting_pickup` olur. Üye veya yönetici çamaşırların alındığını bildirince boşalır. `finishUsage` hem rezervasyon ID'sinin hem makinenin aktif kullanım ID'sinin aynı olduğunu denetler; eski bir teslim çağrısı yeni yıkamayı boşaltamaz. Üye engellenirken devam eden yıkama fiziksel olarak tutulur; yönetici teslim onayıyla çözer.

Makine fiziksel olarak doluyken sıradaki kişi no-show sayılmaz. Gecikme boyunca toleransı yenilenir; makine boşalınca yeniden geliş süresi tanınır. Program kendi tutulan bloğuna sığmayacak kadar gecikmişse başlatma reddedilir; kullanıcının iptal edip yeni saat seçmesi gerekir. Sistem sonraki kabul edilmiş zamanı otomatik kaydırmaz. Adminin arıza/gözden geçirme moduna aldığı boş makinedeki gelecekteki rezervasyon ve teklifler iptal edilir.

## Timer ve canlı durum

Timer işlemleri veritabanı saatini kullanır. Ön yüz makine ekranını yenilerken `refreshTimers` çağırır; Realtime izinli değişiklikleri iletir. 30 saniyelik kontrollü yenileme, görünmez hale gelen üyelikleri ve saat geçişlerini de yakalar. İstemci okuma işleminde sahte durum hesaplamaz.

Kimse uygulamayı açmasa da sürelerin işlemesi için Supabase Cron'da postgres rolüyle her dakika şu görev çalıştırılır:

```sql
select private.cs_run_timers();
```

Bu invoker timer fonksiyonu authenticated/anon tarafından çağrılamaz; cron sahibi çağırır. Timer; süresi dolan teklifleri, gelmeyen kullanımları, teslim alınması gereken makineleri ve FIFO tekliflerini aynı alan lock'u altında değerlendirir. Bildirimler şu an uygulama içidir; işletim sistemi push teslimi ve mağaza dağıtımı ayrı entegrasyon gerektirir.

## Testler ve tekrar çalıştırma

Makine QR anahtarları `private.cs_machine_codes` tablosundadır. Bu tablo istemci rollerine kapalıdır ve Realtime yayınına eklenmez. Ortak `cs_machines.qr_token` alanı uyumluluk için boş tutulur; INSERT WAL kayıtları da anahtar içermez. Snapshot gerçek QR anahtarını yalnız aktif yönetici/sahibe verir. Eski etiketler taşınırken korunur; kullanım başlatma işlemi özel tabloyla kodu doğrular. Sabit etiket fotoğrafıyla paylaşılabildiğinden QR, fiziksel varlık kanıtı değildir.

QR hızlı kullanım: `private.cs_command` yeni `resolveMachine`, `startWalkIn`, `addProgram` ve `watchMachine` işlemlerini yönetir; önceki işlemler yetkili `cs_command_v1` gövdesine yönlendirilir. Eski gövdeler doğrudan istemciye kapalıdır. `resolveMachine` yalnız aktif üyede makine seçimini döndürür; kayıt yazmaz. `startWalkIn` gerçek makine/program eşleşmesini, alan kilidini, tek hakkı, FIFO teklifini, kotayı, kapanışı ve sonraki rezervasyonu kontrol edip kullanım ile makine durumunu aynı transaction içinde yazar.

`cs_machine_watches` sadece kişinin kendi aktif alan takibini RLS ile gösterir; istemci doğrudan yazamaz. Makine `running` → `awaiting_pickup` geçince sahibine tahmini bitiş hatırlatması, fiziksel teslim sonrası `available` geçince takiplere tek seferlik bildirim yazılır. Takip 24 saat geçerlidir, yenilenebilir ve üyelik kapatılırsa silinir. Bildirim makineyi kullanıcıya ayırmaz. `supabase/tests/qr_walk_in.sql` gerçek SQL izin ve akış regresyonudur; sonunda rollback yapılır.

`node --test tests/backend.test.mjs` yerel demo adaptörünün aynı üretim kaynağında üyelik, QR, kota, çakışma, eski teslim, FIFO teklif ve kalıcı storage davranışlarını denetler. Demo testleri PostgreSQL güvenlik testinin yerine geçmez.

`supabase/tests/backend_security.sql` gerçek PostgreSQL üzerinde synthetic Auth kullanıcılarıyla izin/ret senaryolarını test eder. Tüm işlemleri tek transaction içinde yapıp `ROLLBACK` ettiği için gerçek hesap ve çamaşırhane oluşturmaz. Test PostgreSQL'in çakışma kısıtını, RLS'i, engellemeyi, eski session ID'sini, tahmini bitişi ve süresi dolmuş teklifi gerçekten kullanır. Supabase'e migration uygulanmadan bu test çalıştırılamaz.

Migration dosyası Supabase CLI `migration new bootstrap` komutuyla oluşturulmuştur. Supabase schema değişiminde migration + test + güvenlik advisors sonucu birlikte incelenmelidir. Üretimde gözlem, e-posta SMTP ayarı, yedekleme ve gerçek makine süreleri pilotla doğrulanmalıdır.

## Yerel demo hesapları

| Hesap | Durum | Parola |
|---|---|---|
| `owner@demo.local` | Kuzey Yurdu sahibi | `demo12345` |
| `member@demo.local` | Aktif üye | `demo12345` |
| `pending@demo.local` | Yönetici onayı bekleyen üye | `demo12345` |

Davet örneği `KUZEY2026`; makine QR tokenları `CAMASIR-DEMO-1`, `CAMASIR-DEMO-2`, `CAMASIR-DEMO-3`. Yeni kod üretildiğinde örnek kod da iptal olur. Demo verisi yalnız sağlanan storage içinde bulunur; ayrı telefon ve bilgisayar demoları ortak sunucu gibi paylaşılmaz. Gerçek çevrim içi ortak kullanım Supabase bağlantısında gerçekleşir. Demo kayıt ekranında yalnız `demo12345` kullanılır; kişisel parola yerel demoda saklanmaz. Demo verileri migration ile gerçek sisteme eklenmez.

Resmî kaynaklar: [Supabase Functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase veri güvenliği](https://supabase.com/docs/guides/database/secure-data), [PostgreSQL exclusion constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).
