# Streamlit web yayını

Streamlit için Python arayüzü `apps/streamlit/` klasöründedir. Cloud başlangıç dosyası repo kökündeki `streamlit_app.py` dosyasıdır. Next.js paneli ve Android/iPhone kaynakları mevcut klasörlerinde geliştirilir. Tüm arayüzler aynı Supabase hesabını, veritabanını ve güvenli RPC işlemlerini kullanır.

## Yerelde çalıştır

```powershell
python -m venv work/streamlit-venv
.\work\streamlit-venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .streamlit/secrets.toml.example .streamlit/secrets.toml
# secrets.toml içindeki proje URL / publishable key değerlerini doldur.
.\work\streamlit-venv\Scripts\python.exe -m streamlit run streamlit_app.py
```

Adres: http://localhost:8501. Mevcut uygulama hesabıyla giriş yapılır. Yerel Streamlit sürümü demo değildir; canlı verileri kullanır. Python oturumu tarayıcı bağlantısına özeldir; sayfa tamamen yenilenirse tekrar giriş gerekebilir. Kullanıcı istemcileri ve oturumlar genel cache veya disk üzerinde saklanmaz.

## GitHub'dan Community Cloud'a yayın

1. https://share.streamlit.io adresinde kendi hesabınla giriş yap. GitHub bağlantısında **aahmetggungor** hesabını seç; yalnız gereken repo erişimini ver.
2. **Create app → Deploy from GitHub** ile `aahmetggungor/camasir-sirasi` reposunu, `main` dalını ve `streamlit_app.py` dosyasını seç.
3. Python **3.11** seç. İstersen uygun bir `camasir-sirasi` alt alan adı seç; müsaitliği Cloud kontrol eder.
4. **Advanced settings → Secrets** içine aşağıdaki ayarları gir. Gerçek değerleri GitHub'a yazma.

```toml
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your_public_key"
SITE_URL = "https://actual-deployed-address.streamlit.app"
```

5. **Deploy** ile başlat; uygulama açılıp bağlantı/giriş ekranı görünene kadar kurulum günlüklerini kontrol et.
6. Supabase Auth ayarlarında gerçek HTTPS uygulama adresini izin verilen Redirect URL listesine ekle. Yeni kayıt e-postası için uygun SMTP yapılandırması gerekir; Free Plan varsayılan e-posta hizmeti genel kullanıcılara gönderim için yeterli değildir. Supabase Site URL ayarını değiştirmek mobil / Next.js yönlendirmelerini de etkileyebilir; var olan adresleri silme.

Repo özel kalabilir. Cloud'un uygulama görünürlüğü ayrıca değerlendirilir; varsayılan özel uygulama GitHub/Streamlit erişimi ister. Alan üyelerinin yalnız uygulama hesabıyla girmesi için Cloud paylaşım ayarında uygulama erişimi ayrıca açılmalıdır. Bu, Supabase'deki alan/üye yetkilerini kaldırmaz; giriş ve onay olmadan alandaki makineler gösterilmez.

## Çalışan web akışları

- Hesap girişi/kayıt, özel alan oluşturma, davet koduyla başvuru ve yönetici onayı.
- Ayrı Çamaşır / Kurutma ekranları; sade liste, aktif sayaç ve kalan süreye göre sıralama.
- Makine/program ekleme, özel QR etiketi indirme, QR bağlantısı veya kod ile program seçip kullanım başlatma.
- Saatli rezervasyon, FIFO sıra isteği, teklif kabul/ret, ortak tek aktif hak ve kota.
- Fiziksel teslim onayı, bakım, tek seferlik boşalma takibi, bildirimler ve kullanım kuralları.

Webde kamera taraması yerine makine kodu/QR bağlantısı girişi vardır; Android/iPhone kaynaklarındaki kamera tarayıcısı mevcut. Ekran verileri aktif tarayıcı oturumunda 30 saniyede bir yenilenir; aktif sayaç her saniye güncellenir. Cloud uygulamasının uyuması veritabanındaki Cron'u durdurmaz. Arka plan OS push bildirimi bu sürümde yok.

## Kontroller

```powershell
.\work\streamlit-venv\Scripts\python.exe -m unittest discover -s apps/streamlit/tests -v
.\work\streamlit-venv\Scripts\python.exe -m pip check
```

`requirements.in` doğrudan bağımlılıkları, `requirements.txt` tüm sürüm sabitlemelerini içerir. Yeni sürümlerde bağımlılıkları ayrı ortamda çöz ve lock dosyasını güncelle.
