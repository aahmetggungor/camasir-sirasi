# Sunumda kodu nasıl anlatırım?

## Anlatım sırası

1. **Problem:** Ortak makinenin boş olup olmadığını kontrol etmek, gelmeyen rezervasyonlar ve çamaşırları alma gecikmesi.
2. **Çözüm:** Özel mekân alanı, yetkili üyelik, rezervasyon ve boşalan yere teklif.
3. **Kullanıcı akışı:** Hesap → davet → yönetici onayı → QR → program → kullanım → teslim alma. Önceden saat ayırma ve boşalan yere sıra isteme de desteklenir.
4. **Teknik yapı:** Mobil ve web iki ayrı arayüz; ortak TypeScript istemci; PostgreSQL tek karar kaynağı.
5. **Güvenlik:** Ekran düğmesinden bağımsız olarak her işlemde aktif alan üyeliği kontrol edilir.
6. **Sıra güvenilirliği:** Aynı alanın işlemleri kilitlenir, çakışan bloklar veritabanı kısıtıyla reddedilir.
7. **Sonuç:** Kullanıcı kendi sırasını, yönetici ise üyeleri ve makineleri yönetir.

## Gösterilecek dosyalar

| Dosya                                        | Bir cümleyle anlatımı                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/mobile/App.tsx`                        | Kullanıcının oturumuna ve üyeliğine göre ekranları açar.                         |
| `apps/mobile/src/screens/MachinesScreen.tsx` | Makine, program ve uygun başlangıç seçimini gösterir.                            |
| `apps/mobile/src/screens/QueueScreen.tsx`    | QR, kullanım, teslim alma, bekleme ve teklif akışını yönetir.                    |
| `apps/web/src/components/administration.tsx` | Yönetici üyelik kararlarını ve alan kurallarını yönetir.                         |
| `apps/web/src/components/qr-label.tsx`       | Gerçek makine kodunu okunabilir QR etiketine dönüştürür.                         |
| `packages/core/src/types.ts`                 | Mobil ve webin aynı veri biçimlerini kullanmasını sağlar.                        |
| `packages/core/src/remote.ts`                | Ekrandaki işlemi güvenli Supabase RPC çağrısına çevirir.                         |
| `supabase/migrations/*bootstrap.sql`         | Alan, üyelik, makine, rezervasyon ve yetki kurallarını kurar.                    |
| `supabase/tests/backend_security.sql`        | Onaysız kullanıcı, yanlış QR ve çakışma gibi hatalı durumların reddini kanıtlar. |

## Sunum gösterimi

Çamaşır ve Kurutma menülerini sırayla aç: çamaşır listesinde kurutma kaydı, kurutma listesinde çamaşır kaydı görünmez. Kurutma bölümünde makine eklerken program adları kurutmaya uygun gelir. Aynı QR, sayaç, rezervasyon ve sıra akışının kurutmada da çalıştığını göster. Veritabanındaki `machine_type` gerçek türü saklar; iki tür tek işlem altyapısını paylaşır. Mavi/amber vurgu ve açık etiket renk farkını anlamayı kolaylaştırır. İki tür için toplam tek aktif hak kuralı korunur.

Hızlı kullanım gösterimi: mobilde üst menüdeki QR düğmesine bas, makine etiketini okut, program kısayolunu seç ve fiziksel başlatma onayını ver. Önceden rezervasyon oluşturmadan uygun makinede kullanım açılır. Aktif makineler ekranında geri sayımı, çoktan aza sıralamayı, **Boşalınca haber ver** ile **Sıra iste** farkını göster. Bildirim hakkı ayırmaz; sıra isteği hak tutar. **Program ekle** yönetici web panelinde mevcut makine kartındadır.

Kod: `MachineScan.tsx` makineyi çözüp formu açar; `packages/core/src/machines.ts` QR bağlantısı, sayaç ve sıralamayı iki platform için ortak tutar. `qr_walk_in_and_machine_alerts` migration'ındaki `startWalkIn` aynı alan kilidi altında program, üyelik, tek hak, kota ve çakışma kontrolü yapar. `qr_walk_in.sql` bu davranışların PostgreSQL testidir.

Webi `?demo=1` ile aç. Yönetici hesabını doldurup giriş yap; Üyeler ekranındaki bekleyen başvuruyu incele. Doğrulama kutusu işaretlenmeden onay düğmesinin kapalı olduğunu göster. Ardından onay ver, makineleri ve bir QR etiketini göster. Üye hesabında uygun saati seç, rezervasyonu ve boşalma/teklif ekranlarını anlat.

Mobil önizlemede giriş, alan seçimi, makine ve Sıram ekranlarını göster. Demo ile gerçek sistem arasındaki farkı açıkça belirt: demo cihazda örnek veri saklar; gerçek kullanım Supabase'e bağlıdır. QR fiziksel makineyi uzaktan çalıştırmaz; kullanım onayı kaydeder. Tahmini süre dolması, çamaşırların alındığını kanıtlamaz.

## Soru cevap için kısa ifadeler

- **Kod başkasına giderse?** Başvuru açabilir; yönetici doğrulamadan üyelik aktif olmaz.
- **İki kişi aynı saati seçerse?** Sunucudaki kilit ve zaman aralığı kısıtı ikinci isteği reddeder.
- **Üye yurttan ayrılırsa?** Yönetici erişimi kapatır; yeni veri ve işlem yetkisi kalmaz.
- **İnternet olmazsa?** Yeni rezervasyon veya başlatma onayı verilemez.
- **Neden Supabase?** PostgreSQL, Auth ve Realtime aynı altyapıda; uygulama kuralları yine bizim SQL kodumuzdadır.
- **Neden ayrı mobil/web?** Telefonda kamera ve kullanım akışı; webde daha geniş yönetim tabloları.

Plan belgeleri fikir ve sonraki aşamaları da içerir; sunumda mevcut çalışan kapsamı README'deki özellik listesiyle eşleştir.
