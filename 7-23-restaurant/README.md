# 7/23 Dönercisi (7-23 Restaurant) — QR Menü

Broşürdeki menünün telefonda okunacak, tek dosyalık statik sürümü. Kurulum, derleme veya sunucu gerekmez.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | QR kod okutulunca açılan menü. Tüm ürünler ve fiyatlar bu dosyanın içindedir. |
| `qr.html` | Menü adresinden QR kod üretir; yazdırılabilir masa kartı çıkarır. |

## Yayınlama (GitHub Pages)

1. Depo ayarlarında **Settings → Pages → Build and deployment → Source: Deploy from a branch** seçin.
2. Branch olarak `master`, klasör olarak `/ (root)` seçin ve kaydedin.
3. Menü şu adreste açılır: `https://avibrahimozen.github.io/leogal/7-23-restaurant/`
4. Aynı adresin sonuna `qr.html` ekleyerek QR kodu üretin ve yazdırın.

Herhangi bir statik barındırma (Netlify, Vercel, cPanel) da çalışır; klasörü olduğu gibi yüklemek yeterlidir.

## Fiyat güncelleme

`index.html` dosyasını bir metin düzenleyiciyle açın. Her ürün tek satırdır:

```html
<li><span class="nm">Ayran</span><span class="dots"></span><span class="pr">75 ₺</span></li>
```

Fiyatı değiştirip kaydedin, GitHub'a gönderin. QR kodun yeniden basılması gerekmez; adres aynı kaldığı sürece kod çalışmaya devam eder.

Döner bölümü 100 / 150 / 200 gr sütunlu tablodur; bir gramajda ürün yoksa `—` bırakın.

## İletişim bilgileri

- Alo Paket: 0552 990 07 23 (arama ve WhatsApp bağlantısı alt çubukta)
- Adres: Arapsuyu Mah. Belediye Cad. No: 12/B, Konyaaltı / Antalya
