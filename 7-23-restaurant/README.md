# 7 23 Gece Dönercisi — QR Menü

Broşürdeki menünün telefonda okunacak, tek dosyalık statik sürümü. Kurulum, derleme veya sunucu gerekmez.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | QR kod okutulunca açılan menü. Tüm ürünler ve fiyatlar bu dosyanın içindedir. |
| `qr.html` | İstediğiniz adres için QR kod üretir (adres değişirse diye). |
| `masa-karti.html` | Hazır QR gömülü, A6 boyutunda basılabilir masa kartı. Yazı tipleri gömülüdür; internet gerekmez. |
| `qr/menu-qr.png`, `qr/menu-qr.svg` | Kalıcı menü adresinin QR kodu. Broşüre, tabelaya, sosyal medyaya koyabilirsiniz. |
| `qr/masa-karti.pdf`, `qr/masa-karti.png` | Masa kartının baskıya hazır hali (A6, 105 × 148 mm). |

## QR kod hangi adrese gidiyor?

Kalıcı QR şu adresi açar: `https://avibrahimozen.github.io/leogal/7-23-restaurant/`

Adres GitHub Pages üzerinden yayında. Klasör adı (`7-23-restaurant`) bu adresin parçasıdır; klasörü yeniden adlandırırsanız basılı QR kodlar çalışmaz.

## Yayınlama (GitHub Pages)

Pages şu anda açık ve `claude/7-23-restaurant-ut49hl` dalından yayın yapıyor. Menü şu adreste: `https://avibrahimozen.github.io/leogal/7-23-restaurant/`

Bu dal `master`'a birleştirildikten sonra:

1. **Settings → Pages → Build and deployment** sayfasını açın.
2. Branch olarak `master`, klasör olarak `/ (root)` seçin ve kaydedin.
3. Adres değişmez; basılı QR kodlar çalışmaya devam eder.

Herhangi bir statik barındırma (Netlify, Vercel, cPanel) da çalışır; klasörü olduğu gibi yüklemek yeterlidir.

## Fiyat güncelleme

`index.html` dosyasını bir metin düzenleyiciyle açın. Her ürün tek satırdır:

```html
<li><span class="nm">Ayran</span><span class="dots"></span><span class="pr">75 ₺</span></li>
```

Fiyatı değiştirip kaydedin, GitHub'a gönderin. QR kodun yeniden basılması gerekmez; adres aynı kaldığı sürece kod çalışmaya devam eder.

Döner bölümü 100 / 150 / 200 gr sütunlu tablodur; bir gramajda ürün yoksa `—` bırakın.

## İletişim bilgileri

- İşletme: 7 23 Gece Dönercisi
- Alo Paket: 0552 990 07 23 (arama ve WhatsApp bağlantısı alt çubukta)
- Adres: Arapsuyu Mah. Belediye Cad. No: 12/B, Konyaaltı / Antalya
