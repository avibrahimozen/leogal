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

## Mobil uygulamayı çalıştırma

```bash
cd mobile
npm install
npx expo start                # Expo Go ile QR kodu okutun
```

Gerçek cihazda test ederken API adresini bilgisayarınızın yerel ağ IP'siyle verin:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start
```

Aynı uygulama iki modda çalışır: **yolcu** hesabıyla girince harita + çağrı ekranı,
**sürücü** hesabıyla girince çağrı kabul + kazanç ekranları açılır.

## API özeti

| Uç | Açıklama |
|---|---|
| `POST /api/auth/register` | Yolcu kaydı |
| `POST /api/auth/register-driver` | Sürücü başvurusu (araç bilgileriyle) |
| `POST /api/auth/login` | Giriş (telefon + şifre → JWT) |
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

- [ ] SMS ile telefon doğrulama (OTP)
- [ ] Yönetici web paneli (onay, tahsilat, canlı harita)
- [ ] Kart ile ödeme + otomatik komisyon kesintisi
- [ ] Gerçek yol rotası ve süre tahmini (OSRM / Google Directions)
- [ ] Anlık bildirimler (Expo Push)
- [ ] Sürücü belge yükleme (ruhsat/ehliyet fotoğrafı)

---

> ⚠️ Bu MVP'dir: JWT gizli anahtarı ve yönetici şifresi üretim ortamında mutlaka
> değiştirilmeli, sunucu HTTPS arkasında çalıştırılmalıdır.
