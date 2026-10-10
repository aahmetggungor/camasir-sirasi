# ÇamaşırSırası mobil

Android ve iPhone için gerçek Expo / React Native uygulaması. Yönetim panelinden ayrı bir uygulamadır; `@camasir/core` aracılığıyla aynı Supabase veritabanını kullanır.

## Başlatma

Proje kökünde `npm install`, sonra `npm run mobile`. Terminaldeki QR ile uyumlu Expo Go üzerinden fiziksel telefonda aç veya Android Studio emülatörünü başlatıp `a` tuşuna bas. Windows'ta iOS Simulator çalışmaz; iPhone testini fiziksel cihazda yap. Yerel native Android derlemesi için kökteki geliştirme kılavuzunu izle.

`apps/mobile/.env` içine aşağıdaki iki **public istemci** değerini birlikte ekle. Gizli `service_role` anahtarı kullanılmaz.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJE.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

İkisi de yoksa açıkça etiketlenmiş **Sunum modu** çalışır; bu cihazdaki örnek verileri kullanır. Demo hesapları `member@demo.local`, `owner@demo.local` ve `pending@demo.local`, parola `demo12345`. Demo gerçek kurum üyeliği veya bulut verisi üretmez. Tek bir env değeri girilirse yapılandırma hatası oluşur; hatalı yapılandırma sessizce demo moduna düşmez.

## Kodu sunumda nasıl anlatırım?

| Dosya | Sorumluluk |
| --- | --- |
| `App.tsx` | Oturum durumuna göre giriş veya alan ekranlarını açar; üç sekme ve alan seçiciyi yönetir. |
| `src/hooks/useLaundry.ts` | Oturum/snapshot okuma, hata, yenileme, Realtime aboneliği ve ön planda yenileme. |
| `src/services/client.ts` | Ortak veri istemcisi; native oturumu Expo SecureStore ile saklar. |
| `src/services/secureStorage.ts` | Büyük değerleri küçük şifreli parçalarda saklar; yazma kesilirse önceki oturum korunur. |
| `src/screens/AuthScreen.tsx` | Giriş, kayıt ve e-posta doğrulama açıklaması. |
| `src/screens/AreaScreen.tsx` | Alan oluşturma, davet önizlemesi, başvuru ve erişim durumları. |
| `src/screens/MachinesScreen.tsx` | Makine durumları, program seçimi ve sunucudan gelen uygun saatler. |
| `src/screens/QueueScreen.tsx` | Rezervasyon, QR/kod ile başlatma, boşalma onayı, bekleme ve teklif işlemleri. |
| `src/components/ui.tsx` | Okunur ve tekrar kullanılan native arayüz parçaları. |
| `src/theme.ts` | Renklerin tek kaynağı. |

**Temel akış:** hesap → alan daveti → yönetici onayı → uygun saat → rezervasyon → makine QR/kodu → kullanıcı fiziksel makineyi çalıştırır → kullanım kaydı → tahmini bitiş → çamaşırları alma onayı.

Üyelik başvurusu beklerken veya erişim kapatıldığında `App.tsx` makine ekranını açmaz. Bu yalnız kullanıcı deneyimi katmanıdır; asıl yetki ve çakışma kontrolü veritabanındadır. İstemci kendi kendine üyelik onaylamaz veya boş makine ilan etmez. Tahmini program bitişi ve fiziksel boşalma ayrı olaylardır.

QR kamerası yalnız `Kamerayı aç` düğmesine dokunulunca izin ister. İzin verilmezse kod elle girilebilir. Arka planda kamera önizlemesi durur. Tarayıcı önizlemesi kamera testi yerine geçmez. İlk sürüm bildirimleri uygulama içindedir; cihaz push bildirimi bu sürümde yoktur.

Kurulu native uygulamada `camasirsirasi://join?code=KOD` veya `camasirsirasi://join/KOD` bağlantısı başvuru ekranını açar. Hesap kapalıysa kod giriş sonrasına kadar bellekte tutulur. Standart HTTPS app/universal link alan adı ve mağaza kurulum yönlendirmesi sonraki dağıtım yapılandırmasıdır; custom scheme'in tarayıcıdan güvenli biçimde açılması tarayıcı davranışına bağlıdır. Expo Go yerine bu scheme'i içeren native development build üzerinde doğrula.

Güvenlik, yarış koşulları ve üyelik ayrımı testleri ortak çekirdekte / veritabanı testlerinde bulunur. Bu dosyalar ekranların gerçek cihazda doğrulandığı iddiası değildir; Android ve iPhone kabul testleri fiziksel cihaz veya emülatör üzerinde ayrıca yürütülmelidir.

Native depolama mantığını kökten `node --test apps/mobile/tests/secure-storage.test.mjs` ile kontrol et. Testler büyük Unicode değerleri, yarım kalan yazmayı, ardışık token yenilemesini ve çıkışta temizlemeyi doğrular. İşletim sisteminin SecureStore modülünü taklit eden bu testler fiziksel Keychain/Keystore testi yerine geçmez.
