# GitHub üzerinden Render yayını

Render'da Next.js web arayüzünü (`apps/web`) yayınlayacağız. Mobil uygulama
`apps/mobile` içindedir; iki uygulama aynı Supabase veritabanını kullanır.
Streamlit sürümü ayrı bir web arayüzüdür. Bu dosyanın hazırlanması Render'da
yayın açıldığı anlamına gelmez.

## Yayın ayarları

Render'da **New → Web Service** seçip kendi GitHub hesabındaki
`aahmetggungor/camasir-sirasi` reposunu bağla. Özel repo erişimini bu projeyle
sınırlandır.

| Alan | Değer |
| --- | --- |
| Branch | `main` |
| Root Directory | Boş bırak (repo kökü) |
| Language / Runtime | `Node` |
| Region | `Frankfurt` |
| Instance Type | `Free` |
| Build Command | `npm ci --include=dev && npm run build:web` |
| Start Command | `npm run start --workspace @camasir/web -- --hostname 0.0.0.0` |
| Health Check Path | `/` |

Repo kökünden kurulum yapmak gerekir: web ve mobil, `packages/core` adlı ortak
paketi kullanır. `next start`, Render'ın verdiği `PORT` değerini kendisi okur.

## Environment

İlk build başlamadan bu üç değişkeni Render'daki **Environment** alanına ekle:

| Değişken | Değerin kaynağı |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` içindeki aynı isimli değer |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `apps/web/.env.local` içindeki `sb_publishable_...` değeri |

Bu iki Supabase değeri tarayıcıya gönderilir. Burada veritabanı parolası,
`service_role` veya `sb_secret_...` kullanılmaz; kullanıcı erişimini Supabase
Auth ve veritabanı kuralları denetler. `NEXT_PUBLIC_` değerleri build sırasında
pakete yazılır; sonradan değiştirirsen yeniden build ve deploy gerekir.

Alternatif olarak **New → Blueprint** ile kökteki `render.yaml` dosyasını
kullanabilirsin. Dosya tek bir Free web servisi tanımlar; Supabase değerlerini
kurulumda sorar. Ek veritabanı veya disk tanımlamaz. GitHub `main` dalına gelen
değişiklikler Render'ın varsayılan otomatik yayın davranışıyla yeniden yayınlanır.

## Yayın sonrasında

Gerçek Render adresi açılınca giriş ekranını ve mevcut uygulama hesabınla girişi
kontrol et. Ardından Supabase **Authentication → URL Configuration** altında
bu HTTPS adresini **Redirect URLs** listesine ekle. Render ana web adresi
olacaksa **Site URL** değerini de yeni adrese geçir: ortak kayıt fonksiyonu,
e-posta doğrulaması için bu varsayılan adresi kullanır. Mevcut yerel ve mobil
yönlendirme adreslerini listede koru. Kayıt e-postası ile dönüşü ayrıca dene.

Free servis 15 dakika trafik almazsa uyur; sonraki açılış yaklaşık bir dakika
sürebilir. Derste gösterimden önce adresi açıp servisi uyandırmak iyi olur.

## Resmî kaynaklar

- [Render'da Next.js](https://render.com/docs/deploy-nextjs-app)
- [Node sürümü](https://render.com/docs/node-version)
- [Port ve web servisi](https://render.com/docs/web-services#port-binding)
- [Blueprint alanları](https://render.com/docs/blueprint-spec)
- [Free servis sınırları](https://render.com/docs/free)
- [Next.js ortam değişkenleri](https://nextjs.org/docs/app/guides/environment-variables)
- [Supabase yönlendirme adresleri](https://supabase.com/docs/guides/auth/redirect-urls)
