# 7 23 Gece Dönercisi — QR Menü ve Web Sitesi

Tek bir veri dosyasından (`src/data/menu.json`) QR menüyü, web sitesini ve arama motoru dosyalarını üreten Node.js projesi. Çıktılar statik HTML'dir; GitHub Pages üzerinde yayınlanır, sunucu gerekmez.

## Adresler

| Sayfa | Adres |
| --- | --- |
| QR menü | https://avibrahimozen.github.io/leogal/7-23-restaurant/ |
| Web sitesi | https://avibrahimozen.github.io/leogal/7-23-restaurant/site/ |
| Site haritası | https://avibrahimozen.github.io/leogal/7-23-restaurant/sitemap.xml |

QR kodlar menü adresine gider. Klasör adı (`7-23-restaurant`) bu adresin parçasıdır; klasörü yeniden adlandırırsanız basılı QR kodlar çalışmaz.

## Kurulum ve komutlar

Node.js 18 veya üstü yeterlidir; harici paket yoktur (`npm install` gerekmez).

```bash
cd 7-23-restaurant
npm run build   # src/ altındaki veriden index.html, site/index.html ve sitemap.xml üretir
npm run dev     # http://localhost:4723 adresinde yayınlar, src/ değişince yeniden üretir
npm test        # veri tutarlılığı, güncel çıktı, SEO ve bağlantı kontrolleri
```

`npm test` GitHub Actions'ta her push'ta çalışır (`.github/workflows/7-23-restaurant.yml`). Üretilen dosyalar commit edildiği için Pages ayarını değiştirmek gerekmez.

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
| `src/data/menu.json` | İşletme bilgileri, menü, fiyatlar, öne çıkanlar. Tek doğruluk kaynağı. |
| `src/templates/menu.js` | QR menü şablonu. |
| `src/templates/site.js` | Web sitesi şablonu. |
| `src/lib/seo.js` | `<head>` etiketleri, schema.org Restaurant ve Menu nesneleri, sitemap. |
| `src/build.js`, `src/dev.js`, `src/check.js` | Üretim, geliştirme sunucusu, kontrol. |
| `index.html`, `site/index.html`, `sitemap.xml` | **Üretilen** dosyalar; elle düzenlemeyin, `npm run build` ile yenileyin. |
| `masa-karti.html` | Hazır QR gömülü, A6 basılabilir masa kartı. Yazı tipleri gömülüdür. |
| `qr.html` | İstediğiniz adres için QR üretici (adres değişirse diye). |
| `qr/menu-qr.png`, `qr/menu-qr.svg` | Menü adresinin QR kodu. Broşüre, tabelaya, sosyal medyaya. |
| `qr/masa-karti.pdf`, `qr/masa-karti.png` | Masa kartının baskıya hazır hali (105 × 148 mm). |

## SEO: neler yapıldı, neler sizde

Sayfalarda hazır olanlar:

- Her sayfada ayrı başlık, açıklama ve canonical adres; Open Graph ve Twitter etiketleri.
- schema.org **Restaurant** (adres, telefon, çalışma saatleri, sipariş eylemi) ve menü sayfasında gramaja göre fiyat teklifleriyle tam **Menu** yapısı. Google bunları zengin sonuçlarda kullanabilir.
- `sitemap.xml`, `lang="tr"`, tek `h1`, anlamlı başlık hiyerarşisi, telefon ve harita bağlantıları.
- Tek dosya, satır içi CSS, harici kütüphane yok: hızlı açılır.

Sizin yapmanız gerekenler:

1. **Google Business Profile** açın; adres, telefon ve saatleri buradakiyle birebir girin ve web sitesi olarak site adresini verin. Yerel aramada asıl etkiyi bu yapar.
2. **Google Search Console**'a siteyi ekleyin ve `sitemap.xml` adresini gönderin.
3. Mümkün olduğunda **özel alan adı** alın (örn. `723gecedonercisi.com`). Pages ayarında alan adını tanımlayıp `src/data/menu.json` içindeki `baseUrl`'i değiştirmek ve yeniden üretmek yeterlidir. QR kodlar eski adrese gideceği için o zaman yeniden basılmalı; bu yüzden alan adı kararını erken vermek iyi olur.
4. Gerçek yemek fotoğrafları ekleyin; şablonlara `<img>` olarak `alt` metniyle konabilir.

## İletişim bilgileri

- İşletme: 7 23 Gece Dönercisi
- Alo Paket: 0552 990 07 23 (arama ve WhatsApp bağlantıları sayfalarda)
- Adres: Arapsuyu Mah. Belediye Cad. No: 12/B, Konyaaltı / Antalya
- Çalışma saatleri: Her gün 07:00–23:00
