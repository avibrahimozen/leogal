# 7 23 Gece Dönercisi — Web Sitesi ve QR Menü

Tek bir veri dosyasından (`src/data/menu.json`) web sitesini, QR menüyü ve arama motoru dosyalarını üreten Node.js projesi. Çıktılar statik HTML'dir; GitHub Pages üzerinde **antalyagecedonercisi.com** alan adıyla yayınlanır, sunucu gerekmez.

## Adresler

| Sayfa | Adres |
| --- | --- |
| Web sitesi | https://antalyagecedonercisi.com/ |
| QR menü | https://antalyagecedonercisi.com/menu/ |
| Eski QR adresi (aynı menü) | https://antalyagecedonercisi.com/7-23-restaurant/ |
| Site haritası | https://antalyagecedonercisi.com/sitemap.xml |

Alan adı bağlanana kadar aynı sayfalar `https://avibrahimozen.github.io/leogal/` altında açılır. Alan adı bağlandıktan sonra GitHub bu eski adresleri yeni alan adına yönlendirir; ilk basılan QR kodlar (`/7-23-restaurant/`) çalışmaya devam eder.

## Alan adını bağlama (tek seferlik)

1. `antalyagecedonercisi.com` alan adını bir kayıt firmasından alın.
2. Alan adının DNS ayarlarına şu kayıtları ekleyin:

   | Tür | Ad | Değer |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `avibrahimozen.github.io` |

3. DNS yayıldıktan sonra (genelde 1 saat, en fazla 1 gün) `src/data/menu.json` içinde `"domainActive": false` değerini `true` yapın, `npm run build` ve `npm test` çalıştırıp commit edin. Bu, depo köküne `CNAME` dosyasını koyar ve tüm adresleri alan adına çevirir; GitHub dalı yayınlarken bunu **Settings → Pages → Custom domain** alanına yazar.
4. Aynı Pages sayfasında **Enforce HTTPS** kutusunu işaretleyin.
5. Tarayıcıda https://antalyagecedonercisi.com/menu/ açılıyorsa QR kodları bastırabilirsiniz.

`domainActive` kapalıyken sayfalar `avibrahimozen.github.io/leogal/` adresini kullanır ve `CNAME` üretilmez. Anahtar DNS'ten önce açılırsa GitHub, github.io adreslerini henüz çalışmayan alan adına yönlendirir ve mevcut QR kodlar kırılır; o yüzden sıra önemli.

## Kurulum ve komutlar

Node.js 18 veya üstü yeterlidir; harici paket yoktur (`npm install` gerekmez).

```bash
cd 7-23-restaurant
npm run build   # depo köküne index.html, menu/, 7-23-restaurant/index.html, 404.html, sitemap.xml, robots.txt, CNAME üretir
npm run dev     # http://localhost:4723 adresinde yayınlar, src/ değişince yeniden üretir
npm test        # veri tutarlılığı, güncel çıktı, SEO ve bağlantı kontrolleri
```

`npm test` GitHub Actions'ta her push'ta çalışır (`.github/workflows/7-23-restaurant.yml`). Üretilen dosyalar commit edilir; Pages ayarı "Deploy from a branch, / (root)" olarak kalır.

## Fiyat veya ürün güncelleme

1. `src/data/menu.json` dosyasını açın. Her ürün tek satırdır:

   ```json
   { "id": "ayran", "name": "Ayran", "price": 75 }
   ```

   Döner bölümünde fiyatlar 100 / 150 / 200 gr sırasıyla dizidir; bir gramajda ürün yoksa `null` bırakın:

   ```json
   { "id": "iskender", "name": "İskender", "prices": [650, 850, null] }
   ```

2. Aynı dosyadaki `"updated"` tarihini bugünün tarihi yapın (site haritasına yazılır).
3. `npm run build`, ardından `npm test` çalıştırın.
4. Üretilen dosyalarla birlikte commit edip GitHub'a gönderin. QR kodun yeniden basılması gerekmez.

Web sitesindeki "öne çıkanlar" kartları `featured` listesinden gelir; ürün `id`'si ve kısa açıklama yeterlidir.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `src/data/menu.json` | İşletme bilgileri, alan adı, menü, fiyatlar, öne çıkanlar. Tek doğruluk kaynağı. |
| `src/templates/site.js`, `menu.js`, `notfound.js` | Web sitesi, QR menü ve 404 şablonları. |
| `src/lib/seo.js` | `<head>` etiketleri, schema.org Restaurant ve Menu nesneleri, sitemap, robots. |
| `src/build.js`, `src/dev.js`, `src/check.js` | Üretim, geliştirme sunucusu, kontrol. |
| Depo kökünde `index.html`, `menu/`, `7-23-restaurant/index.html`, `404.html`, `sitemap.xml`, `robots.txt`, `CNAME` | **Üretilen** dosyalar; elle düzenlemeyin, `npm run build` ile yenileyin. |
| `masa-karti.html` | Hazır QR gömülü, A6 basılabilir masa kartı. Yazı tipleri gömülüdür. |
| `qr.html` | İstediğiniz adres için QR üretici. |
| `qr/menu-qr.png`, `qr/menu-qr.svg` | `antalyagecedonercisi.com/menu/` adresinin QR kodu. Broşüre, tabelaya, sosyal medyaya. |
| `qr/masa-karti.pdf`, `qr/masa-karti.png` | Masa kartının baskıya hazır hali (105 × 148 mm). |

## SEO: neler yapıldı, neler sizde

Sayfalarda hazır olanlar:

- Her sayfada ayrı başlık, açıklama ve canonical adres; Open Graph ve Twitter etiketleri. Eski QR adresi canonical olarak `/menu/` adresini gösterir, arama motorunda tek sayfa sayılır.
- schema.org **Restaurant** (adres, telefon, çalışma saatleri, sipariş eylemi) ve menü sayfasında gramaja göre fiyat teklifleriyle tam **Menu** yapısı.
- Alan adı kökünde `sitemap.xml` ve `robots.txt`; `lang="tr"`, tek `h1`, anlamlı başlık hiyerarşisi.
- Tek dosya, satır içi CSS, harici kütüphane yok: hızlı açılır.

Sizin yapmanız gerekenler:

1. **Google Business Profile** açın; adres, telefon ve saatleri buradakiyle birebir girin, web sitesi olarak `https://antalyagecedonercisi.com/` yazın. Yerel aramada asıl etkiyi bu yapar.
2. **Google Search Console**'a alan adını ekleyin ve `https://antalyagecedonercisi.com/sitemap.xml` adresini gönderin.
3. Gerçek yemek fotoğrafları ekleyin; şablonlara `<img>` olarak `alt` metniyle konabilir.

Not: Depo kökündeki `docs/` klasörü de alan adı altında erişilebilir olur; `robots.txt` bu klasörü taramadan hariç tutar. İleride restoranı ayrı bir depoya taşımak daha temiz olur.

## İletişim bilgileri

- İşletme: 7 23 Gece Dönercisi
- Alo Paket: 0552 990 07 23 (arama ve WhatsApp bağlantıları sayfalarda)
- Adres: Arapsuyu Mah. Belediye Cad. No: 12/B, Konyaaltı / Antalya
- Çalışma saatleri: Her gün 07:00–23:00
