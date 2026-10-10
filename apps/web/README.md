# ÇamaşırSırası web yönetimi

Next.js + TypeScript yönetim paneli. Mobil uygulama ile aynı `@camasir/core` istemcisini ve Supabase veritabanını kullanır.

Proje kökünde `npm run web`. Gerçek bağlantı `/`; örnek verilerle sunum `/?demo=1` adresindedir. Sunum kullanıcıları gerçek Supabase hesabı değildir.

## Dosya haritası

| Dosya | İşlev |
|---|---|
| `src/app/page.tsx` | Panelin başlangıç sayfası |
| `src/lib/laundry.tsx` | Oturum, snapshot, işlemler, hata ve canlı yenileme |
| `src/components/access.tsx` | Kayıt/giriş, alan oluşturma ve davetle başvuru |
| `src/components/laundry-app.tsx` | Alan seçici, menü ve üyelik durumuna göre ekran |
| `src/components/machines.tsx` | Makine/program yönetimi ve uygun saat seçimi |
| `src/components/reservations.tsx` | Kullanım, teslim alma, bekleme ve teklif |
| `src/components/administration.tsx` | Üyelik onayı, davetler ve kurallar |
| `src/components/qr-label.tsx` | Makine QR etiketi ve PNG indirme |
| `src/app/globals.css` | Responsive arayüzün görsel düzeni |

Yetki kararları React ekranlarında verilmez; sunucu canlı üyelik ve rolü denetler. Yönetici doğrulaması gerçek sakin kaydına dayanmalıdır. Yerel geliştirme e-posta dönüş bağlantısını laptopta aç; mobil/mağaza dağıtımında gerçek web adresi ve native bağlantı dönüşleri yapılandırılır.
