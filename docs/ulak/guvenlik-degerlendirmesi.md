# Ulak — Güvenlik Değerlendirmesi

**Tarih:** 2026-09-04 · **Kapsam:** `server/` (Express + Socket.IO + node:sqlite API), `server/public/admin/index.html` (yönetim paneli), `mobile/src/api/*`, `mobile/src/store/auth.tsx` (yalnızca okundu) · **Yöntem:** kod okuma + `server/test/security.test.ts` ile doğrulama (46 yeni test).

Önem dereceleri: **Yüksek** — kimlik/yetki atlatma, hesap ele geçirme veya toplu kötüye kullanım; **Orta** — sınırlı etki veya ek koşul gerektirir; **Düşük** — savunma derinliği / iyileştirme.

## Özet tablosu

| # | Bulgu | Önem | Bu dalda |
|---|---|---|---|
| Y1 | Varsayılan `JWT_SECRET` ve `ULAK_ADMIN_PASSWORD` ile üretimde çalışabilme | Yüksek | **Düzeltildi** (üretimde başlatma reddi) |
| Y2 | Girişte kaba kuvvet sınırı yok | Yüksek | **Düzeltildi** (telefon + IP başına sınır) |
| Y3 | `SMS_PROVIDER=console` iken OTP kodu API yanıtında (`devCode`) döner — üretimde telefon doğrulaması sıfırlanır | Yüksek | **Düzeltildi** (üretimde `devCode` dönmez + açılışta uyarı) |
| O1 | JWT 30 gün geçerli, iptal/yenileme yok; askıya alınan sürücünün token'ı çalışmaya devam eder | Orta | Düzeltilmedi |
| O2 | Yönetim paneli token'ı `localStorage`'da; XSS → tam yönetici ele geçirme | Orta | Kısmen (CSP, kaçış denetimi, satır içi işleyici kaldırıldı) |
| O3 | Onaylı her sürücü, teklif almadığı bir çağrıyı ID ile kabul edebilir | Orta | Düzeltilmedi (`rides.ts`) |
| O4 | Socket `driver:location` için aralık denetimi ve hız sınırı yok | Orta | Düzeltilmedi (`realtime.ts`) |
| O5 | OTP isteğinde yalnızca telefon başına sınır vardı (IP başına yok) → SMS maliyet saldırısı | Orta | **Düzeltildi** (IP başına 20/saat) |
| O6 | Girişsiz `nearby-drivers` ile sürücü takibi / toplu kazıma | Orta | Kısmen (IP başına 120/dk) |
| O7 | Yolcu ve sürücünün telefon numaraları karşı tarafa ham olarak verilir ve geçmişte kalır | Orta | Düzeltilmedi (`rides.ts`) |
| O8 | Güvenlik başlıkları yok (nosniff, frame, CSP, referrer) | Orta | **Düzeltildi** |
| O9 | İstek gövdesi boyut sınırı yok; bozuk JSON'da HTML yığın izi sızar | Orta | **Düzeltildi** (100 KB, JSON 413/400) |
| O10 | Mobil uygulama token'ı şifresiz `AsyncStorage`'da | Orta | Düzeltilmedi (`mobile/` kapsam dışı) |
| D1 | `verifyToken` rolü ve `sub`'ı doğrulamıyordu | Düşük | **Düzeltildi** |
| D2 | OTP karşılaştırması sabit zamanlı değil | Düşük | **Düzeltildi** |
| D3 | CORS `*` (HTTP ve Socket.IO) | Düşük | Düzeltilmedi (bilinçli) |
| D4 | Ters vekil arkasında `req.ip` yanlış (trust proxy yok) | Düşük | **Düzeltildi** (`TRUST_PROXY=1`) |
| D5 | Hesap numaralandırma (kayıt 409, giriş zamanlaması) | Düşük | Düzeltilmedi |
| D6 | Yönetici şifresi yalnızca ilk açılışta yazılır; şifre değiştirme ucu yok | Düşük | Düzeltilmedi |
| D7 | `ULAK_OTP_REQUIRED=false` ile `phone_verified_at` boş hesaplar tam yetkili | Düşük | Kısmen (üretimde uyarı) |
| D8 | HTTPS zorunlu değil / HSTS yok | Düşük | Kısmen (HTTPS'te HSTS) |
| D9 | Yönetim paneli CSP'sinde `'unsafe-inline'` | Düşük | Kısmen (takip işi) |
| D10 | Hız sınırlayıcı bellek içi, tek süreç | Bilgi | — |

---

## Yüksek

### Y1 — Varsayılan gizli değerlerle üretimde çalışabilme
- **Nerede:** `server/src/config.ts` (`jwtSecret`, `adminPassword`), `server/src/index.ts`.
- **Neden önemli:** `JWT_SECRET` varsayılan ve kaynak kodda açık. Anahtarı bilen herkes istediği kullanıcı/rol için (yönetici dahil) geçerli oturum token'ı üretebilir; ayrıca OTP kod hash'i ve telefon doğrulama token'ı da aynı anahtarla imzalanır. Varsayılan yönetici şifresi (`ulak-admin`) README'de yazılıdır.
- **Öneri:** Üretimde varsayılanları reddet; 32+ karakter rastgele anahtar (`openssl rand -base64 48`); yönetici şifresini ilk girişte değiştirmeye zorla.
- **Bu dalda:** `assertProductionSecrets(env)` (saf fonksiyon, `config.ts`): `NODE_ENV=production` iken varsayılan/eksik/32 karakterden kısa `JWT_SECRET` veya varsayılan `ULAK_ADMIN_PASSWORD` ile Türkçe hata verip başlatmayı engeller; diğer ortamlarda tek satırlık uyarı. `index.ts` açılışta çağırır. Birim testleri `security.test.ts`.

### Y2 — Girişte kaba kuvvet sınırı yok
- **Nerede:** `POST /api/auth/login` (`server/src/routes/auth.ts`).
- **Neden önemli:** Şifreler 6 karakter olabilir; sınırsız deneme ile telefon numarası bilinen hesaplar (yönetici telefonu README'de) ele geçirilebilir.
- **Öneri:** Telefon ve IP başına kayan pencere sınırı; uzun vadede hesap kilidi/CAPTCHA.
- **Bu dalda:** `server/src/lib/rateLimit.ts` (bağımlılıksız kayan pencere). Giriş: telefon başına 10/15 dk (numaranın farklı yazımları `normalizePhone` ile tek sayaçta), IP başına 30/15 dk. Yanıt `429 {error:'Çok fazla istek. Lütfen biraz sonra tekrar deneyin'}` + `Retry-After`.

### Y3 — `console` SMS sağlayıcısı OTP kodunu API yanıtında döndürür
- **Nerede:** `server/src/otp.ts` (`devCode`), README varsayılanı `SMS_PROVIDER=console`.
- **Neden önemli:** Üretimde Twilio yapılandırılmadan (varsayılanla) çalıştırılırsa `/otp/request` kodu yanıtta verir; herkes herhangi bir telefon numarasıyla kayıt olabilir, telefon doğrulaması tamamen etkisiz kalır.
- **Öneri:** Üretimde `devCode` asla dönmesin; açılışta uyarı/ret.
- **Bu dalda:** `devCode` yalnızca `console` sağlayıcı **ve** `NODE_ENV≠production` iken döner (kod sunucu loguna yine yazılır). `assertProductionSecrets` üretimde `SMS_PROVIDER=console` için uyarır. Takip: ekip isterse bu uyarı sert redde çevrilebilir.

## Orta

### O1 — 30 günlük JWT, iptal yok
- **Nerede:** `config.jwtExpiresIn = '30d'`, `lib/auth.ts`; sürücü askıya alma `routes/admin.ts`.
- **Neden önemli:** Çalınan token 30 gün geçerli; şifre değişikliği/askıya alma token'ı geçersiz kılmaz. Askıya alınan sürücü çevrimiçi olamaz (`driver/status` denetler) ama `driver/location`, `rides/*` gibi uçlara token'ı ile erişmeye devam eder.
- **Öneri:** Kısa ömürlü erişim token'ı (örn. 1 saat) + yenileme token'ı; `users.token_version` sütunu ile toplu iptal; `requireAuth('driver')` içinde sürücü durumunu (approved) her istekte denetle. `db.ts` şeması değiştiği için bu dalda yapılmadı.

### O2 — Yönetim paneli token'ı `localStorage`'da
- **Nerede:** `server/public/admin/index.html` (`ulak.admin.token`).
- **Neden önemli:** Paneldeki herhangi bir XSS (sürücü adı, adres, plaka gibi kullanıcı girdileri tabloya basılır) 30 günlük yönetici token'ını sızdırır.
- **Öneri:** Panel için `httpOnly` çerez oturumu (+ CSRF) veya kısa ömürlü yönetici token'ı; `'unsafe-inline'`siz CSP.
- **Bu dalda (kısmen):** Tüm sunucu kaynaklı dizeler `esc()` ile basılıyor (denetlendi: `toast`/`prompt`/hata metinleri `textContent` veya sayısal); sayısal alanlar `Number()`/`esc()` ile; satır içi `onclick` işleyicileri `data-*` + tek dinleyiciye çevrildi; CSP eklendi (bkz. O8); tarife alanlarında `autocomplete="off"`.

### O3 — Teklif almayan sürücü çağrıyı kabul edebilir
- **Nerede:** `POST /api/rides/:id/accept` (`routes/rides.ts`) — `matcher.offered` denetlenmiyor; çağrı ID'leri ardışık.
- **Neden önemli:** Onaylı bir sürücü, `requested` durumdaki her çağrıyı (mesafe/yarıçap fark etmeksizin) ID tahmin ederek kapabilir; dürüst sürücülerin önüne geçer, yolcuyu uzaktaki bir sürücüye bağlar.
- **Öneri:** `Matcher.wasOffered(rideId, driverId)` denetimi; kabulde sürücü konumunun `matchRadiusKm` içinde olduğunu doğrula. `rides.ts`/`matching.ts` bu dalda kapsam dışı.

### O4 — Socket `driver:location` denetimi
- **Nerede:** `server/src/realtime.ts`.
- **Neden önemli:** REST yolu (`driver/location`) zod ile aralık denetler; socket yolu yalnızca `typeof === 'number'` kontrol eder (NaN/±Infinity/999 geçer) ve hız sınırı yoktur → saniyede binlerce DB yazımı ile hizmet dışı bırakma. Sahtecilik **mümkün değil**: konum daima `socket.data.user.id` (JWT) için yazılır; testle doğrulandı.
- **Öneri:** Aynı zod şemasını kullan; soket başına ≥1 sn aralık; `Number.isFinite`. `realtime.ts` kapsam dışı.

### O5 — OTP isteğinde IP başına sınır yok
- **Bu dalda:** `POST /api/auth/otp/request` IP başına 20/saat (telefon başına 5/saat + 45 sn bekleme `OtpService`'te zaten var). Dağıtık saldırıya karşı ek öneri: günlük küresel SMS tavanı, Twilio coğrafi izinleri, kayıt formunda CAPTCHA.

### O6 — Girişsiz `nearby-drivers`
- **Nerede:** `server/src/routes/public.ts`.
- **Değerlendirme:** Konum ~100 m'ye yuvarlanıyor, kimlik dönmüyor — iyi. Ancak yarıçap 100 km'ye kadar, 50 sonuç, `vehicleModel` + periyodik sorgu ile tek tek sürücüleri gün boyu izlemek mümkün. `lastDemand` (bot ipucu) kimliksiz girdiyle yazılıyor (yalnızca demo botlarını etkiler).
- **Bu dalda:** IP başına 120/dk. **Öneri:** yarıçapı 25 km, sonucu 20 ile sınırla; `vehicleModel`'i kaldır ya da genelle; 30 sn'lik önbellek anlık görüntüsü sun (`lastDemand` kaydını yalnızca girişli isteklerde yap).

### O7 — Telefon numaralarının paylaşımı
- **Nerede:** `rideToJson` (`routes/rides.ts`): `driver.phone` yolcuya, `passenger.phone` sürücüye; `/rides/history` ile kalıcı.
- **Öneri:** Yalnızca aktif çağrıda paylaş, tamamlanınca maskele; uzun vadede uygulama içi arama/mesaj.

### O8 — Güvenlik başlıkları
- **Bu dalda:** `server/src/lib/securityHeaders.ts` (helmet yok): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (kamera/mikrofon/konum/ödeme/usb kapalı), `/api` için `Cache-Control: no-store` ve `CSP: default-src 'none'`, `/admin` için Leaflet (`https://unpkg.com`) ve OSM karolarına (`https://tile.openstreetmap.org`) izin veren CSP; HTTPS bağlantılarda HSTS.

### O9 — Gövde boyutu ve hata sızıntısı
- **Bu dalda:** `express.json({ limit: '100kb' })`; `lib/jsonBodyErrors.ts` body-parser hatalarını JSON'a çevirir (413 `İstek gövdesi çok büyük`, 400 `Geçersiz JSON gövdesi`). Diğer hatalar `next(err)` ile ekip arkadaşının genel JSON hata işleyicisine akar; `res.headersSent` denetimi ile idempotent.

### O10 — Mobil token depolama
- **Nerede:** `mobile/src/store/auth.tsx` — `AsyncStorage` (şifresiz). **Öneri:** `expo-secure-store`. Mobil dizin bu görevde salt okunur.

## Düşük

- **D1 `verifyToken` (Düzeltildi):** Artık HS256'ya sabit; `sub` pozitif tam sayı, `role` bilinen üç rolden biri olmalı. Telefon doğrulama token'ının (sub=telefon, role yok) oturum yerine geçemediği ve `alg=none`/yabancı anahtarın reddedildiği testle doğrulandı.
- **D2 OTP karşılaştırması (Düzeltildi):** `timingSafeEqual` ile sabit zamanlı; deneme sınırı (5) zaten vardı.
- **D3 CORS `*`:** Kimlik doğrulama Bearer token ile (çerez yok) yapıldığından ve panel aynı kaynaktan sunulduğundan pratik etkisi düşük; panel farklı bir kaynağa taşınırsa `CORS_ORIGIN` izin listesi ekleyin.
- **D4 `trust proxy` (Düzeltildi):** `TRUST_PROXY=1` ile `app.set('trust proxy', 1)`; nginx/Caddy arkasında hız sınırı ve HSTS gerçek istemci IP/protokolünü görür. Doğrudan internete açık sunucuda **kapalı** kalmalı (aksi halde `X-Forwarded-For` ile IP sahtelenip sınır atlatılır).
- **D5 Hesap numaralandırma:** Kayıt `409 zaten kayıtlı`; girişte `bcrypt.compareSync` yalnızca kullanıcı varsa çalışır (zamanlama farkı). Öneri: kullanıcı yokken sahte hash ile karşılaştır. Giriş hata metni zaten tekdüze.
- **D6 Yönetici şifresi:** `ensureAdmin` yalnızca ilk açılışta yazar; `ULAK_ADMIN_PASSWORD` sonradan değişirse hesap güncellenmez. Öneri: `PUT /api/auth/password` ucu; değişen env'de yeniden hash'le.
- **D7 `phone_verified_at`:** `ULAK_OTP_REQUIRED=false` ile kayıt olan hesaplarda `NULL` kalır; bugün hiçbir uç bu alanı yetki için kullanmıyor (bilinçli: yalnızca yerel geliştirme). Üretimde açılışta uyarı verilir.
- **D8 HTTPS:** Sunucu TLS sonlandırmayan bir vekil arkasında çalışmalı; HSTS yalnızca `req.secure` iken gönderilir.
- **D9 CSP `'unsafe-inline'`:** Panel tek dosyada satır içi `<script>/<style>` kullanıyor. Takip: dosyalara ayır veya nonce; satır içi olay işleyiciler bu dalda kaldırıldığı için geçiş kolaylaştı.
- **D10 Hız sınırlayıcı:** Bellek içi; yatay ölçekte paylaşımlı depo (Redis) gerekir.

## Doğrulanan ve sorun bulunmayan noktalar

- **SQL enjeksiyonu:** `rides.ts` `active`/`history` içindeki dinamik sütun adı yalnızca `req.user.role` (JWT'den) üzerinden `'driver_id' | 'passenger_id'` sabitlerinden biridir; `transition()`'daki `timestampColumn` çağrı yerlerinde sabit dizedir; tüm değerler parametrelidir. `admin.ts` `status` filtresi parametrelidir.
- **Socket sahteciliği:** `driver:location` yalnızca JWT'deki sürücü için yazılır; gövdedeki `driverId/userId` yok sayılır; yolcu soketi yazamaz; token'sız bağlantı reddedilir (testler).
- **Sahiplik (IDOR):** `arrived/start/complete` `driver_id = ?` ile; `cancel` ve `rate` sahiplik denetler; `active/history` kullanıcıya bağlı; yönetici uçları `requireAuth('admin')` arkasında (testler).
- **Girdi sınırları:** zod `max` uzunlukları (isim 80, adres 200, şifre 100, plaka 16…), `limit` 1–200, `radiusKm` 1–100, artı 100 KB gövde.
- **Token amaçları:** Oturum token'ı `purpose` taşımadığı için telefon doğrulamasında kullanılamaz; telefon doğrulama token'ı `role` taşımadığı için oturum olamaz.
- **`devCode`:** Yalnızca `console` sağlayıcıda (ve artık yalnızca üretim dışında).

## Bu dalda eklenen yapılandırma

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `TRUST_PROXY` | kapalı | `1` → ters vekil arkasında `X-Forwarded-For/Proto` kullanılır |
| `ULAK_RL_LOGIN_PHONE` | `10` | Giriş: telefon başına / 15 dk |
| `ULAK_RL_LOGIN_IP` | `30` | Giriş: IP başına / 15 dk (yerel bot koşularında `ULAK_BOTS` yüksekse artırın) |
| `ULAK_RL_OTP_IP` | `20` | OTP isteği: IP başına / saat |
| `ULAK_RL_NEARBY_IP` | `120` | Yakındaki taksiler: IP başına / dk |

Üretim kontrol listesi: `NODE_ENV=production`, `JWT_SECRET` (≥32 rastgele karakter), `ULAK_ADMIN_PASSWORD`, `SMS_PROVIDER=twilio` + `TWILIO_*`, TLS sonlandıran vekil + `TRUST_PROXY=1`.

## Önerilen sonraki adımlar (öncelik sırasıyla)

1. Kısa ömürlü token + iptal (`token_version`) ve her istekte sürücü durum denetimi (O1).
2. `accept` ucunda teklif/yarıçap denetimi (O3) ve telefon maskeleme (O7).
3. Socket konum şeması + hız sınırı (O4).
4. Panel oturumunu `httpOnly` çereze taşı; CSP'den `'unsafe-inline'`ı kaldır (O2, D9).
5. `nearby-drivers` çıktısını daraltıp önbellekle (O6); mobilde `expo-secure-store` (O10).
6. Yönetici şifre değiştirme ucu; girişte sahte hash karşılaştırması (D5, D6).
