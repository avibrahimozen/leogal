# 🚕 Ulak — Kuzey Kıbrıs'ın Taksi Ağı

Ulak, Kuzey Kıbrıs Türk Cumhuriyeti için Uber tarzı bir taksi çağırma platformudur.
Taksiciler platforma kaydolur, yönetici onayından geçer ve tamamlanan her yolculuktan
küçük bir **komisyon** karşılığında müşteri alır. Yolcular tek dokunuşla en yakın
taksiyi çağırır, sürücüsünü haritada canlı takip eder.

## Nasıl çalışır?

1. **Taksici kaydolur** — araç plakası, model ve ruhsat bilgileriyle başvurur; hesap `onay bekliyor` durumuna düşer.
2. **Yönetici onaylar** — admin API üzerinden başvuru incelenir ve onaylanır.
3. **Sürücü çevrimiçi olur** — uygulama konumunu 10 saniyede bir platforma bildirir.
4. **Yolcu taksi çağırır** — hedefini seçer, tahmini ücreti görür, çağrı oluşturur.
5. **Eşleştirme** — çağrı, alış noktasına en yakın 8 müsait sürücüye anlık teklif olarak gider; **ilk kabul eden kazanır**.
6. **Yolculuk** — sürücü yolda → kapıda → yolculuk → tamamlandı akışı; yolcu sürücüyü canlı izler.
7. **Komisyon** — yolculuk tamamlanınca ücretin %15'i (ayarlanabilir) sürücünün komisyon borcuna işlenir. Sürücü borcunu Ulak'a öder, yönetici tahsilatı deftere kaydeder.

## Depo yapısı

```
server/   Node.js API + Socket.IO gerçek zamanlı katman (TypeScript, node:sqlite)
mobile/   Expo / React Native uygulaması — yolcu ve sürücü modları (TypeScript)
```

## Sunucuyu çalıştırma

> Gereksinim: Node.js ≥ 22.5 (yerleşik `node:sqlite` kullanılır, harici veritabanı gerekmez)

```bash
cd server
npm install
npm run dev        # http://localhost:4000
npm test           # 36 test: ücret, auth, uçtan uca çağrı akışı, komisyon
```

Ortam değişkenleri (hepsi opsiyonel):

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `4000` | API portu |
| `JWT_SECRET` | dev anahtarı | **Üretimde mutlaka değiştirin** |
| `ULAK_DB_PATH` | `ulak.db` | SQLite dosya yolu |
| `ULAK_ADMIN_PHONE` | `+903920000000` | İlk açılışta oluşturulan yönetici |
| `ULAK_ADMIN_PASSWORD` | `ulak-admin` | **Üretimde mutlaka değiştirin** |
| `SMS_PROVIDER` | `console` | `console` (kod loga + yanıta yazılır) veya `twilio` |
| `ULAK_OTP_REQUIRED` | `true` | `false` yapılırsa kayıtta SMS doğrulaması istenmez |
| `TWILIO_ACCOUNT_SID` | — | Twilio hesap SID (yalnızca `SMS_PROVIDER=twilio`) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_FROM` | — | SMS gönderen numara (Twilio'dan alınan) |

## SMS ile telefon doğrulama (OTP)

Kayıt, SMS doğrulaması gerektirir: uygulama forma girilen numaraya 6 haneli kod
gönderir (`POST /api/auth/otp/request`), kullanıcı kodu girer
(`POST /api/auth/otp/verify`) ve dönen kısa ömürlü `verificationToken` ile kayıt
tamamlanır. Kurallar: kod 5 dakika geçerli, 45 sn'den önce yeniden gönderilemez,
telefon başına saatte en çok 5 kod, 5 hatalı denemede kod geçersizleşir.

- **Geliştirme** (`SMS_PROVIDER=console`, varsayılan): gerçek SMS gitmez; kod
  sunucu loguna yazılır ve API yanıtında `devCode` olarak döner — mobil uygulama
  bu kodu ekranda ipucu olarak gösterir.
- **Üretim** (`SMS_PROVIDER=twilio`): Twilio hesabı açıp üç `TWILIO_*`
  değişkenini ayarlayın; KKTC (+90) numaralarına gönderim desteklenir. Farklı bir
  sağlayıcı (örn. NetGSM) için `server/src/lib/sms.ts` içindeki `SmsSender`
  arayüzünü uygulamak yeterlidir.

## Yönetim paneli

Sunucu çalışırken tarayıcıdan **`http://localhost:4000/admin`** adresini açın ve
yönetici hesabıyla giriş yapın. Panelden yapabilecekleriniz:

- **Genel Bakış** — yolcu/sürücü/yolculuk sayıları, brüt hacim, toplam komisyon ve
  çevrimiçi sürücülerin **canlı haritası** (10 sn'de bir güncellenir)
- **Sürücüler** — onay bekleyen başvuruları onaylama/reddetme, onaylı sürücüyü
  askıya alma, komisyon borcu görüntüleme ve **tahsilat kaydetme**
- **Yolculuklar** — son 100 yolculuk: güzergâh, yolcu, sürücü, ücret, komisyon
- **Tarife & Komisyon** — açılış/km/asgari ücret ve komisyon oranını anında değiştirme

## Mobil uygulama (iOS + Android)

Uygulama **tek kod tabanından hem iOS hem Android** için derlenir (Expo / React
Native). Her iki platformun paketlemesi de doğrulanmıştır.

### Geliştirme (Expo Go ile)

Uygulama **Expo SDK 57** üzerindedir — mağazadaki güncel Expo Go ile açılır.

```bash
cd mobile
npm install
npx expo start                # iPhone veya Android'de Expo Go ile QR kodu okutun
```

Telefon ve bilgisayar aynı Wi-Fi'da olmalı; sunucu (`cd server && npm run dev`)
açık olmalı. API adresini elle girmeye gerek yok: uygulama Expo Go'da Metro'nun
çalıştığı bilgisayarın IP'sini otomatik bulur ve `:4000` portuna bağlanır.
Farklı bir sunucu kullanmak isterseniz yine de geçersiz kılabilirsiniz:

```bash
EXPO_PUBLIC_API_URL=http://10.0.0.5:4000 npx expo start
```

Bağlantı sorununda: Windows güvenlik duvarında Node'a (4000 portu) izin verin;
uygulama "Sunucuya ulaşılamıyor (http://...)" hatasında denediği adresi gösterir.

### Üyeliksiz kullanım

Karşılama ekranındaki **"Yakındaki Taksileri Gör"** giriş yapmadan haritada
çevrimiçi taksileri gösterir (`GET /api/public/nearby-drivers`). Sürücü konumları
~100 m hassasiyete yuvarlanır; isim, plaka ve telefon paylaşılmaz. Aynı bilgi
giriş yapmış yolcunun ana ekranında da görünür.

### Mağaza derlemeleri (EAS Build)

`mobile/eas.json` içinde üç profil hazır: `development`, `preview` (Android APK +
iOS internal), `production` (App Store / Play Store). Derlemeden önce
`eas.json` içindeki `EXPO_PUBLIC_API_URL` değerini kendi sunucu adresinizle değiştirin.

```bash
cd mobile
npm install -g eas-cli
eas login                          # ücretsiz Expo hesabı yeterli
eas build --platform android --profile preview    # test için APK
eas build --platform ios --profile production     # App Store (Apple Developer hesabı gerekir)
eas build --platform all --profile production     # ikisi birden
```

> iOS derlemesi için Apple Developer üyeliği (99 $/yıl), Play Store için tek
> seferlik 25 $ geliştirici kaydı gerekir. Android'de `preview` profili APK
> üretir; bunu mağazasız doğrudan telefona kurup dağıtabilirsiniz.

Aynı uygulama iki modda çalışır: **yolcu** hesabıyla girince harita + çağrı ekranı,
**sürücü** hesabıyla girince çağrı kabul + kazanç ekranları açılır.

## API özeti

| Uç | Açıklama |
|---|---|
| `POST /api/auth/register` | Yolcu kaydı |
| `POST /api/auth/register-driver` | Sürücü başvurusu (araç bilgileriyle) |
| `POST /api/auth/login` | Giriş (telefon + şifre → JWT) |
| `GET /api/public/nearby-drivers?lat=&lng=` | Yakındaki çevrimiçi taksiler (girişsiz, anonim) |
| `POST /api/rides/estimate` | Ücret tahmini (girişsiz kullanılabilir) |
| `POST /api/rides` | Çağrı oluştur → en yakın sürücülere teklif yayınlanır |
| `POST /api/rides/:id/accept` | Sürücü kabulü — ilk kabul eden kazanır |
| `POST /api/rides/:id/arrived · start · complete` | Yolculuk durum geçişleri |
| `POST /api/rides/:id/cancel` | İptal (sürücü iptalinde çağrı yeniden yayınlanır) |
| `POST /api/rides/:id/rate` | Karşılıklı puanlama (1–5) |
| `GET /api/driver/earnings` | Brüt/net kazanç, komisyon borcu, hesap defteri |
| `GET /api/admin/drivers?status=pending` | Onay bekleyen sürücüler |
| `POST /api/admin/drivers/:id/approve` | Sürücü onayı (reject/suspend de var) |
| `POST /api/admin/drivers/:id/settle` | Komisyon tahsilatını deftere işle |
| `PUT /api/admin/settings` | Taban ücret, km ücreti, asgari ücret, komisyon oranı |

Gerçek zamanlı olaylar (Socket.IO): `ride:offer`, `ride:offer_closed`, `ride:update`,
`driver:location`, `driver:status`.

## Ücret modeli (varsayılanlar)

- Açılış: **90 TL** · Km başına: **25 TL** · Asgari: **150 TL**
- Mesafe: kuş uçuşu × 1.3 yol çarpanı; ücret 5 TL'ye yuvarlanır
- Komisyon: **%15** — tümü `PUT /api/admin/settings` ile çalışırken değiştirilebilir

Örnek: Lefkoşa → Girne ≈ 23 km → **665 TL**, komisyon 99,75 TL.

## Demo hesaplar

Her testte kayıt/SMS akışıyla uğraşmamak için hazır hesaplar oluştur:

```bash
cd server
npm run seed
```

| Hesap | Telefon | Şifre | Not |
|---|---|---|---|
| Yönetici | `+903920000000` | `ulak-admin` | tarayıcıda `/admin` paneli |
| Demo Yolcu | `+905550000001` | `demo123` | 3 yolculukluk geçmişi dolu |
| Demo Sürücü | `+905550000002` | `demo123` | onaylı · GM 100 · ⭐ 4.7 · komisyon borcu var |
| Demo Yolcu 2 | `+905550000003` | `demo123` | temiz hesap — ikinci telefon için |
| Demo Sürücü 2 | `+905550000004` | `demo123` | onaylı · GN 200 · Girne · temiz hesap |

Numarayı `05550000001`, `0555 000 00 01` veya `+905550000001` gibi yazabilirsiniz — sunucu
hepsini aynı hesaba eşler. Script tekrar çalıştırılabilir (kayıtları çoğaltmaz). Çağrı akışını denemek için:
sürücü hesabıyla girip **çevrimiçi ol**, ikinci cihazda yolcu hesabıyla **taksi çağır** —
teklif sürücünün ekranına düşer.

## Sahte taksiler — tek telefonla tam akış (`npm run bots`)

İkinci telefon olmadan yolcu akışını uçtan uca denemek için sahte sürücü botları:

```bash
cd server
npm run bots          # sunucu açıkken, ayrı bir terminalde
```

Botlar (`Taksi Bot 1..6`, plakalar `TB 101…`) gerçek sürücü hesaplarıyla bağlanır,
çevrimiçi olur ve haritada dolaşır. Yolcu olarak taksi çağırdığında en yakın bot
2–5 saniye içinde çağrıyı **kabul eder**, alış noktasına sürer (canlı konum yolcuya
akar), yolculuğu başlatıp tamamlar ve yolcuyu puanlar — komisyon deftere işlenir.

Botlar, uygulamada haritaya bakan yolcunun konumunu algılayıp boştaysa onun
çevresine taşınır; yani KKTC dışından test ederken de eşleşme olur.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `ULAK_BOTS` | `6` | bot sayısı (1–20) |
| `ULAK_BOT_SPEED_KMH` | `90` | sürüş hızı (demo için yüksek tutulabilir) |
| `ULAK_BOT_CENTER` | — | `35.19,33.36` gibi sabit merkez; verilirse yolcuyu takip etmezler |
| `ULAK_API_URL` | `http://localhost:4000` | uzak sunucuya karşı çalıştırmak için |

## Hızlı deneme senaryosu

```bash
# 1) Yönetici girişi
curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+903920000000","password":"ulak-admin"}'

# 2) Sürücü başvurusunu onayla (ADMIN_TOKEN ile)
curl -s localhost:4000/api/admin/drivers?status=pending -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -X POST localhost:4000/api/admin/drivers/2/approve -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Yol haritası

- [x] Yönetici web paneli (onay, tahsilat, canlı harita) — `/admin`
- [x] iOS + Android derleme profilleri (EAS Build)
- [x] SMS ile telefon doğrulama (OTP) — console/Twilio sağlayıcılı
- [ ] Kart ile ödeme + otomatik komisyon kesintisi
- [ ] Gerçek yol rotası ve süre tahmini (OSRM / Google Directions)
- [ ] Anlık bildirimler (Expo Push)
- [ ] Sürücü belge yükleme (ruhsat/ehliyet fotoğrafı)

---

> ⚠️ Bu MVP'dir: JWT gizli anahtarı ve yönetici şifresi üretim ortamında mutlaka
> değiştirilmeli, sunucu HTTPS arkasında çalıştırılmalıdır.
