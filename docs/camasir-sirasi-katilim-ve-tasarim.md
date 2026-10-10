# ÇamaşırSırası — tasarım, mobil uygulama ve üyelik kararları

Tarih: 10 Ekim 2026. Durum: Geliştirme öncesi tasarım. Çalışan backend, mağaza yayını veya gerçek kurum doğrulaması henüz yapılmadı.

## 1. Ürün ve platform kararı

- **Mobil:** React Native + Expo + TypeScript. Telefona kurulan ÇamaşırSırası uygulaması. Kullanıcının onayladığı hedef platformlar Android ve iPhone.
- **Web:** Next.js + TypeScript. Başta alan sahipleri ve yöneticiler için üye onaylama, makine/program ve rezervasyon yönetimi.
- **Veri ve hesap:** Tek Supabase altyapısı; PostgreSQL veritabanı ve Supabase Auth.
- **Ortak kurallar:** Üyelik, kota, rezervasyon ve süre kontrolü veritabanı işlemlerinde tek yerde. Mobil ve web aynı kuralları çağırır.
- **Depo:** Mobil ve web ayrı uygulama klasörleri; ortak TypeScript tipleri, veri erişim yardımcıları ve tasarım değerleri paylaşılır. Web bileşenlerini doğrudan native ekrana taşımayı varsaymayız.

Expo'nun resmi rehberi React Native uygulamalarına Supabase PostgreSQL ve kullanıcı doğrulaması bağlamayı açıklıyor. [Expo / Supabase rehberi](https://docs.expo.dev/guides/using-supabase/)

Çalışan uygulama hedefi ile mağaza yayını ayrı tamamlanma ölçütleridir. Android test için doğrudan kurulabilir paket hazırlanabilir; mağazalara dağıtımda geliştirici hesapları, imzalama ve mağaza süreçleri gerekir. Yayın tamamlandı demek için gerçek yükleme ve dağıtım sonucu doğrulanır. [Expo build rehberi](https://docs.expo.dev/build/setup/)

## 2. Sade UI için seçilen referanslar

| Referans | Kullanacağımız fikir |
| --- | --- |
| [Laundry Services App Design — Behance](https://www.behance.net/gallery/231608319/Laundry-Services-App-Design) | Sade mobil yerleşim, boşluk kullanımı, kısa işlem akışı. Proje açıklaması yumuşak yeşil tonlu minimal arayüz tarif ediyor. |
| [Laundry Booking App Design — Dribbble](https://dribbble.com/shots/14732036-Laundry-Booking-App-Design) | Çamaşır uygulaması için ikinci görsel referans. |
| [shadcn/ui Blocks](https://ui.shadcn.com/blocks) | Web yönetiminde kenar gezinme, üyelik tablosu ve giriş ekranı için açık kaynak bileşen temeli. |

Önerilen ÇamaşırSırası görünümü: açık ve koyu temaya uyumlu nötr zemin; tek mavi vurgu rengi; kısa metin; okunur makine satırları; ölçülü yuvarlak köşeler; en az 44 piksel dokunma alanı. Makine durumu metin ve simgeyle de açıklanır.

Mobil gezinme: **Çamaşırhane / Sıram / Alan**. Üstte aktif alan seçici. Ana ekranda önce kendi rezervasyonu veya yıkaması, ardından makineler. Web yönetimi: **Makineler / Rezervasyonlar / Üyeler / Davetler / Kurallar**. İlk sürümde dekoratif grafikler yerine gerçek işlem listeleri bulunur.

## 3. Hesap ile alan üyeliğini ayırıyoruz

Uygulamaya kayıt olmak, herhangi bir yurdun üyesi olmak anlamına gelmez. Bir genel kullanıcı hesabının her mekânda ayrı üyelik kaydı olur. Aynı kişi evindeki apartmanda yönetici, yurdunda üye olabilir.

Uygulamayı ilk açan ve alanı olmayan kullanıcı **Alana katıl** ekranını görür. Alan oluşturma, yeni mekân yöneticisi akışından erişilir. Her alanın sahibi ve davetleri ayrı olur.

## 4. Bir öğrencinin katılma akışı

1. Uygulamayı kurar; e-posta/parola ile hesap açıp e-postasını doğrular.
2. Yurt yönetiminin paylaştığı bağlantıyı açar, kodu girer veya davet QR'ını okutur.
3. Doğru alanın adını ve kurallarını görür. Makine ve diğer üye verilerini henüz göremez.
4. Adını ve isteğe bağlı oda/birim bilgisini kullanarak katılım talebi gönderir.
5. Ekran **Üyelik onayı bekleniyor** durumuna geçer. Rezervasyon ve makine QR'ı ile kullanım kapalıdır.
6. Yetkili yurt yöneticisi sakin kaydını kontrol eder ve onaylar.
7. Üyelik aktif olur; kullanıcı makineleri, kendi rezervasyonlarını ve sıra işlemlerini kullanabilir.

Yöneticiye başvuru bildirimi gider; kullanıcıya onay veya ret sonucu gösterilir. Uygulamayı silip tekrar kurmak üyeliği silmez; aynı hesapla girişte mevcut durum yüklenir. Davet bağlantısı uygulama kuruluysa ilgili alana yönlendirir; kurulu değilse kurulum/kod bilgisi gösteren web sayfası açılır. QR, bağlantı ve elle kod girişi aynı davet kaydını kullanır.

## 5. Yurt sakini olduğunu nasıl doğrularız?

**Güvenilir kaynak yurt yönetiminin sakin kaydıdır.** E-posta doğrulaması e-posta hesabının kontrolünü doğrular. Üniversite e-postası, oda numarası, konum veya bir QR kodu tek başına o yurtta kalındığını kanıtlamaz.

Yöneticinin onayı şu dayanaklardan biriyle verilir:

- Yönetimin mevcut kaydında kişiye ait bilinen e-posta, uygulamadaki doğrulanmış e-postayla eşleştirilir.
- Böyle bir kayıt yoksa yetkili personel kişiyi yüz yüze veya kurumun elindeki bilinen iletişim bilgisi üzerinden doğrular.

Yalnızca kullanıcının yazdığı ad ve oda numarasını listede görmek yeterli doğrulama sayılmaz. İlk sürüm kimlik fotoğrafı veya öğrenci belgesi yüklemeyi gerektirmez. Uygulamaya sakin listesi entegrasyonu sonraki iş olabilir; ilk sürümde yönetici kendi mevcut kaydını kullanır.

Yönetimin izin verdiği dış kullanıcılar da onaylanabilir. Yönetici izin gerekçesi ve gerekiyorsa üyelik bitiş tarihi girer; kullanıcının kendisi izinli/misafir rolü seçemez.

## 6. Davet politikasının sınırları

- Genel katılım bağlantısı veya kodu **başvuru hakkı verir**, aktif üyelik vermez.
- Başlangıç varsayımı: 7 gün geçerli, en fazla 50 yeni başvuru, yönetici tarafından iptal edilebilir davet.
- Kod yeterince rastgele üretilir, denemeler hız sınırına tabidir; veritabanında hash saklanır.
- Davet süresi, iptali, kullanım sınırı ve hesabın durumu sunucuda kontrol edilir.
- Mevcut aktif veya bekleyen üye kodu tekrar kullanınca ikinci kayıt açılmaz, davet hakkı tekrar tüketilmez.
- Çıkarılmış veya engellenmiş kişi yeni kodla kendini aktif hâle getiremez. Yeniden kabul, yöneticinin açık kararıdır.
- Kod internete düşerse yönetici iptal edip yenisini oluşturur. O kodla açılmış, henüz onaylanmamış başvurular incelemeye alınır; mevcut onaylı üyeler sırf davet iptal edildi diye çıkarılmaz.
- Geçerli davetle önceden gönderilmiş başvuru, davetin son kullanım tarihi geçtiğinde otomatik yok olmaz. Yönetici karar verene kadar bekler; onay sırasında kurumun kullanım izni tekrar kontrol edilir.
- Yönetici veya sahip rolleri katılım koduyla verilmez.

Tek kişiye bağlanmış davetler daha sonra desteklenebilir. Bunların doğrudan katılım sağlaması ancak yönetimin kişiyi önceden yetkilendirmesine ve davetin doğrulanmış hesaba bağlanmasına dayanır. İlk sürümün standart akışı zorunlu yönetici onayıdır.

## 7. Gerçek alanın yöneticisi kim olacak?

İlk pilotta yurt sorumlusunun hesabı, gerçek yönetimle görüşülerek alan sahibi yapılır. Alan sahibi başka yetkili hesapları yönetici atayabilir.

Herkes kendi özel alanını açabilir; bir alanın adına yurt adı yazılması resmî kurum doğrulaması sayılmaz. Alanlar varsayılan olarak gizlidir, isim aramasıyla katılma yoktur. Kullanıcı gerçek alanın davetini doğrudan kendi yurt/site yönetiminden alır.

**Doğrulanmış kurum** işareti yalnız platform tarafında kurum yetkilisi kontrol edilince verilir. Alan sahibi bu işareti kendine veremez. İlk genel kullanıma açılışta doğrulama manuel yapılabilir; otomatik kurumsal entegrasyon zorunlu değildir.

## 8. Üyelik durumları ve erişim

| Durum | Kullanıcının erişimi | Sonraki hareket |
| --- | --- | --- |
| Başvuru yok | Geçerli davet üzerinden sınırlı alan önizlemesi | Katılım talebi |
| Bekliyor | Kendi talebi ve alanın temel bilgileri | Yönetici onayı/ret; kullanıcı talebini geri çekebilir |
| Aktif | Alanın makine özeti ve kendi sıra işlemleri | Kullanım veya yönetici erişimi kapatması |
| Reddedildi | Kendi başvuru sonucu | Yönetici kararıyla yeniden değerlendirme |
| Çıkarıldı | Alan verisine yeni erişim ve yeni işlem kapalı | Yönetici yeniden kabul edebilir |
| Engellendi | Katılım ve alan kullanımı kapalı | Yönetici engeli kaldırmalıdır |
| Süresi doldu | Alan kullanımı kapalı | Yönetici süreyi uzatabilir |

Bir kullanıcı bir alanda reddedilse de diğer alanlardaki izinleri bundan otomatik etkilenmez. Sakin/misafir izni alan bazındadır; uygulamanın kendi kötüye kullanım durumları ayrıca ele alınır.

Üye çıkarıldığında gelecekteki rezervasyon, bekleme ve teklif hakları iptal edilir. Devam eden fiziksel yıkama kesilmez; yönetici kontrolüne geçer. Makine boşaldığı onaylanmadan başka kullanıcıya verilmez. Sahip, devretmeden alanı terk edemez.

## 9. Veritabanı

Seçim **Supabase PostgreSQL**. Mobil ve web aynı veritabanını kullanır. Her mekan için ayrı veritabanı açılmaz.

| Veri | Amaç |
| --- | --- |
| Kullanıcı profili | Doğrulanmış hesapla ilişkili ad; Auth ayrı hesap katmanıdır |
| `spaces` | Mekân alanı, sahip ve kurum doğrulama durumu |
| `memberships` | `space_id`, `user_id`, rol, durum, onaylayan, süre ve karar gerekçesi |
| `invitations` | Alan, kod hash'i, süre ve kullanım sınırı |
| `machines`, `programs` | Alana ait makineler ve süreler |
| `reservations`, `usage_sessions` | Ayrılan bloklar, gerçek başlatma ve boşalma onayı |
| `waitlist_entries`, `offers` | Bekleme talepleri ve süreli teklifler |
| `notifications`, `audit_logs` | Bildirimler ve yönetici kararlarının kaydı |

Üyelikte `(space_id, user_id)` tekildir. Alan verileri ve ilişkileri başka alanın makine veya üyeliğine bağlanamaz. Üyelik durumunu ve rolünü üye doğrudan değiştiremez. Davet tüketimi, üye onayı, çıkarma ve rezervasyon işlemleri atomik yapılır.

Her veri isteğinde geçerli oturum, aktif üyelik, üyelik süresi ve gerekli rol kontrol edilir. RLS politikaları veritabanındaki aktif üyeliğe göre uygulanır; kullanıcının düzenleyebildiği profil metadatası yetki kaynağı olmaz. Çıkarma veya süre dolumu sonrası yeni okuma ve işlem yetkisi kapanır. Realtime ve mobil ekranda alanın erişimi de kapatılır; cihazdaki eski görünüm yeni işlem yetkisi sağlamaz. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Makine QR'ı, katılım QR'ından ayrı türdedir. Makine QR'ı alan üyeliği oluşturamaz. Başlatma anında QR'nin makinesi, aktif üyelik ve rezervasyonun alan/makine/kullanıcı kimlikleri birlikte kontrol edilir. Kamera izni verilmezse makine kodu aynı yetki kontrolleriyle girilebilir.

## 10. Açık soruların karar karşılıkları

| Soru | Karar |
| --- | --- |
| Kodu dışarıdan biri öğrenirse? | Başvurabilir; yetkili yönetici doğrulamadan aktif olamaz. |
| Üniversite e-postası yeterli mi? | Hesabı doğrular; belirli yurtta ikameti kanıtlamaz. |
| Oda numarası söylemek yeterli mi? | Hayır. Bilinen iletişim kaydı veya personelin doğrulaması gerekir. |
| Yurttan ayrılırsa? | Yönetici çıkarır veya üyelik süresi dolar; yeni erişim kapanır. |
| İzin verilen misafir? | Yönetici açıkça onaylar ve gerekirse süre verir. |
| Aynı adlı sahte alan? | Gizli alanlar, yönetimin doğrudan daveti ve yalnız platformun verdiği kurum doğrulaması. |
| Uygulamayı silip kurarsa? | Aynı hesapla üyelik durumunu sunucudan tekrar yükler. |
| Engellenince yeni hesap açarsa? | Yeni hesap da onay bekler; yönetici gerçek kişiyi mevcut kayıtla tekrar doğrular. Sadece ad eşleşmesiyle otomatik onay yapılmaz. |
| Yönetici kendini başka alana atayabilir mi? | Hayır; yetkiler alan bazında sunucuda kontrol edilir. |
| Onay beklerken makine QR'ı okursa? | Başlatma reddedilir; QR üyelik vermez. |
| İnternet yoksa? | Yeni rezervasyon/kabul/başlatma yapılamaz; eski bilgi güncel olmadığı belirtilerek gösterilebilir. |
| Sırası gelince otomatik makine açılır mı? | İlk sürüm fiziksel makineyi çalıştırmaz; kullanım onayı kaydeder. |

## 11. Kodlama öncesi bitiş tanımı

Ürün tasarım kararı: **Ayrı mobil uygulama + ayrı yönetim web paneli + ortak PostgreSQL + gizli alan + süreli davet + zorunlu yönetici onayı.**

İlk doğrulama akışı: iki gerçek hesapla kayıt → yöneticinin alanı → üyelik başvurusu → doğrulama/onay → rezervasyon → QR ile kullanım kaydı → teslim alma → bekleyene teklif. Üçüncü, yetkisiz hesap için onay beklerken ve çıkarıldıktan sonra erişimin kapalı olduğu ayrıca doğrulanır.

Platform hedefi kullanıcı tarafından netleştirildi: Android ve iPhone. İki platform ortak Expo/React Native koduyla geliştirilecek; yönetim web paneli aynı Supabase altyapısına bağlanacak.
