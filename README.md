# 🚕 Ulak — Kıbrıs ve Türkiye'nin Taksi Ağı

Ulak, Kuzey Kıbrıs ve Türkiye için Uber tarzı bir taksi çağırma platformudur.
Taksiciler platforma kaydolur, yönetici onayından geçer ve tamamlanan her yolculuktan
küçük bir **komisyon** karşılığında müşteri alır. Yolcular tek dokunuşla en yakın
taksiyi çağırır, sürücüsünü haritada canlı takip eder.

## Nasıl çalışır?

1. **Taksici kaydolur** — araç plakası, model ve ruhsat bilgileriyle başvurur; hesap `onay bekliyor` durumuna düşer.
2. **Yönetici onaylar** — admin API üzerinden başvuru incelenir ve onaylanır.
3. **Sürücü çevrimiçi olur** — uygulama konumunu ve gidiş yönünü birkaç saniyede bir platforma bildirir.
4. **Yolcu taksi çağırır** — hedefini seçer, tahmini ücreti görür, çağrı oluşturur.
5. **Eşleştirme** — çağrı, alış noktasına en yakın 8 müsait sürücüye anlık teklif olarak gider; **ilk kabul eden kazanır**.
6. **Yolculuk** — sürücü yolda → kapıda → yolculuk → tamamlandı akışı; yolcu sürücüyü canlı izler
   (kırmızı araç gerçek yol üzerinde ilerler, kamera Uber gibi yaklaştıkça takip eder). **Yolcu da sürücü de
   istediği an yolculuğu ücretsiz bitirebilir** — ücret ve komisyon işlenmez, ceza yoktur.
7. **Komisyon** — yolculuk tamamlanınca ücretin %15'i (ayarlanabilir) sürücünün komisyon borcuna işlenir. Sürücü borcunu Ulak'a öder, yönetici tahsilatı deftere kaydeder.
8. **Üyelik ücretsiz** — yolcu ve sürücü hesapları için ücret yoktur; sürücü hesabı yönetici onayıyla açılır.

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
npm test           # 184 test: ücret, auth, çağrı akışı, gerçek zamanlı olaylar, bölgeler, güvenlik
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
| `ULAK_ROUTING` | `osrm` | `none` yapılırsa yol rotalama kapanır (kuş uçuşu × 1.3 ile devam eder) |
| `ULAK_OSRM_URL` | `https://router.project-osrm.org` | OSRM sunucusu; üretimde kendi OSRM'ini ver |
| `ULAK_OTP_REQUIRED` | `true` | `false` yapılırsa kayıtta SMS doğrulaması istenmez |
| `TWILIO_ACCOUNT_SID` | — | Twilio hesap SID (yalnızca `SMS_PROVIDER=twilio`) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_FROM` | — | SMS gönderen numara (Twilio'dan alınan) |
| `NODE_ENV` | — | `production` iken varsayılan JWT anahtarı/admin şifresiyle sunucu **başlamaz**; OTP kodu yanıtta dönmez |
| `TRUST_PROXY` | — | `1`: ters proxy (nginx vb.) arkasında gerçek istemci IP'sini kullan (hız sınırları için) |

## Türkiye desteği

Ulak iki ülkede çalışır: **Kuzey Kıbrıs** (6 ilçe) ve **Türkiye** (81 il).

- Sürücü kaydında ülke seçilir, şehir o ülkenin listesinden aranarak seçilir
  (`GET /api/public/regions` tek kaynak; uygulamada çevrimdışı yedek liste var).
- Tarife ülkeye göre belirlenir: alış noktası Kıbrıs adasındaysa KKTC, değilse Türkiye
  tarifesi. Panelde **Tarife & Komisyon → Ülke** seçiciyle ülkeye özel değer girilir;
  girilmeyen alanlar genel tarifeden gelir (`GET/PUT /api/admin/settings?country=TR`).
  Türkiye başlangıç değerleri **yer tutucudur** (açılış 42 / km 33 / asgari 150 TL);
  gerçek değerleri panelden girin.
- **Nereden / Nereye / Duraklar:** alış noktası varsayılan olarak GPS'tir ama elle de seçilir
  ("Konumum" ile GPS'e dönülür); hedef ve **en fazla 5 ara durak** çağrı öncesinde ya da
  **yolculuk sırasında** eklenip çıkarılabilir — ücret tüm rota üzerinden yeniden hesaplanır,
  sürücü durakları haritada ve kartta anında görür (`PUT /api/rides/:id/stops`).
- Hedef seçici: OpenStreetMap (Nominatim) ile Türkiye+Kıbrıs genelinde adres arama,
  KKTC hızlı yerler ve **haritadan seçim** (pimi istediğin noktaya getir). Alış adresi
  otomatik ters-geocode edilir. Nominatim geliştirme için uygundur; üretimde ücretli
  bir geocoder (Google/Mapbox) kullanın — bkz. `mobile/src/api/geocode.ts`.

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

## Güvenlik ve dayanıklılık

- Hız sınırları: giriş (telefon başına 10 / IP başına 30, 15 dk), OTP isteği (IP başına
  20/saat), yakındaki taksiler (IP başına 120/dk) — `server/src/lib/rateLimit.ts`,
  değerler `config.ts` içinde.
- Güvenlik başlıkları (nosniff, frame-deny, CSP) ve 100 KB JSON gövde sınırı; bozuk
  JSON 400, büyük gövde 413, beklenmeyen hata 500 — hepsi JSON döner.
- Uygulaması kapanan sürücüler 5 dakika konum göndermezse otomatik çevrimdışına
  alınır (`server/src/maintenance.ts`); askıya alınan sürücü de anında çevrimdışı olur.
- Sunucu yeniden başlarsa bekleyen çağrıların zaman aşımı yeniden kurulur; sürücü
  iptal edince çağrı **iptal eden sürücü hariç** yeniden yayınlanır.
- Geçmiş sayfalanır: `GET /api/rides/history?limit=20&before=<id>` (`nextBefore` döner).
- Ayrıntılı güvenlik değerlendirmesi ve açık maddeler:
  [`docs/ulak/guvenlik-degerlendirmesi.md`](docs/ulak/guvenlik-degerlendirmesi.md).

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
npm test                      # 40 birim testi (jest-expo): API adresi, durum etiketleri, yer arama, çağrı olayları
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
| `POST /api/rides` | Çağrı oluştur (`stops`: en fazla 5 ara durak) → en yakın sürücülere teklif yayınlanır |
| `PUT /api/rides/:id/stops` | Yolcu durak listesini günceller (beklerken veya yolculukta); ücret yeniden hesaplanır |
| `POST /api/rides/:id/accept` | Sürücü kabulü — ilk kabul eden kazanır |
| `POST /api/rides/:id/arrived · start · complete` | Yolculuk durum geçişleri |
| `POST /api/rides/:id/cancel` | İptal / yolculuğu bitir — yolcu her aşamada, sürücü kabulden sonra; yolculuk sırasında iki taraf için de **ücretsiz** (kabul sonrası sürücü iptalinde çağrı yeniden yayınlanır) |
| `GET /api/public/route?points=lat,lng\|lat,lng` | Gerçek yol rotası (OSRM): geometri, km, dakika (2–7 nokta) |
| `POST /api/rides/:id/rate` | Karşılıklı puanlama (1–5) |
| `GET /api/driver/earnings` | Brüt/net kazanç, komisyon borcu, hesap defteri |
| `GET /api/admin/drivers?status=pending` | Onay bekleyen sürücüler |
| `POST /api/admin/drivers/:id/approve` | Sürücü onayı (reject/suspend de var) |
| `POST /api/admin/drivers/:id/settle` | Komisyon tahsilatını deftere işle |
| `PUT /api/admin/settings` | Taban ücret, km ücreti, asgari ücret, komisyon oranı |

Gerçek zamanlı olaylar (Socket.IO): `ride:offer`, `ride:offer_closed`, `ride:update`,
`driver:location`, `driver:status`.

## Harita: gerçek yol rotası, kırmızı araç, takip kamerası

- **Yol rotası:** yolculuk çizgisi ve sürücü→yolcu yolu OSRM'den (OpenStreetMap) gerçek yol
  geometrisiyle çizilir; taksiler denizin/tarlanın üstünden gitmez. Sunucu `GET /api/public/route`
  ile vekillik eder ve rotaları 10 dk önbellekler. OSRM'e ulaşılamazsa düz çizgiye düşülür
  (`source: 'straight'`), uygulama çalışmaya devam eder.
- **Kırmızı araç:** emoji yerine üstten görünüm araç görseli (`mobile/assets/car-red*.png`);
  sürücünün gidiş yönüne göre döner (GPS yönü yoksa son iki konumdan hesaplanır) ve yeni konuma
  kayarak gider.
- **İkon yol tarifini izler:** sürücü eşleşince konumu rota çizgisine oturtulur (60 m içinde),
  iki güncelleme arasında ikon düz çizgi yerine rotanın köşelerinden geçerek ilerler ve her
  köşede yolun yönüne döner; kalan süre rota üzerinde kalan yola göre güncellenir. Sürücü
  rotadan 100 m'den fazla saparsa rota yeniden istenir (`mobile/src/logic/routeFollow.ts`).
- **Takip kamerası:** sürücü atanınca harita aracı ve sıradaki hedefi (alış noktası / durak / varış)
  birlikte çerçeveler; araç yaklaştıkça yakınlaşır. Haritayı elle kaydırınca takip durur,
  **"Sürücüyü takip et"** ile yeniden başlar. Sürücü uygulamasında da aynı takip vardır.
- **Süre tahmini:** ücret tahmininde ve çağrı kartında OSRM süresi gösterilir (`durationMin`).
- Sahte taksiler (`npm run bots`) yola oturur ve OSRM rotasını yön bilgisiyle izler.
- Telefon sunucuya, sunucu OSRM'e bağlanır: sunucunun çalıştığı bilgisayarın internete çıkışı
  yeterlidir. `router.project-osrm.org` bir demo sunucusudur; üretimde `ULAK_OSRM_URL` ile kendi
  OSRM'ini kullan.

## Ücret modeli (varsayılanlar)

- Açılış: **90 TL** · Km başına: **33 TL** · Asgari: **150 TL**
- Mesafe: yolcunun **alış noktası ile varış noktası** (varsa duraklar dahil) arasındaki gerçek yol
  mesafesi (OSRM); rota alınamazsa kuş uçuşu × 1.3. Ücret = açılış + km × mesafe, 5 TL'ye yuvarlanır.
- Komisyon: **%15** — tümü `PUT /api/admin/settings` ile çalışırken değiştirilebilir
- Yolculuk sırasında bitirilen çağrılarda ücret ve komisyon işlenmez.

Örnek: Lefkoşa → Girne ≈ 23 km → 90 + 33 × 23 = 849 → **850 TL**, komisyon 127,50 TL.

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
- [x] Türkiye desteği: 81 il, ülkeye göre tarife, adres arama ve haritadan seçim
- [x] Gerçek zamanlı entegrasyon testleri, hız sınırları, güvenlik başlıkları, bakım süpürmesi
- [ ] Kart ile ödeme + otomatik komisyon kesintisi
- [x] Gerçek yol rotası ve süre tahmini (OSRM), yöne göre dönen araç ikonu, takip kamerası
- [x] Yolculuğu istediğin an ücretsiz bitirme (yolcu ve sürücü)
- [ ] Anlık bildirimler (Expo Push)
- [ ] Sürücü belge yükleme (ruhsat/ehliyet fotoğrafı)

---

> ⚠️ Bu MVP'dir: JWT gizli anahtarı ve yönetici şifresi üretim ortamında mutlaka
> değiştirilmeli, sunucu HTTPS arkasında çalıştırılmalıdır.
