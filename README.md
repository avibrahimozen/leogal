# Samantha — "Her" tarzı bir AI yoldaşı 👁️🗣️💜

iPhone'unu gömleğinin üst cebine, **arka kamera dışa bakacak** şekilde
yerleştir. **Samantha** kameradan dünyayı görür, seni dinler ve tıpkı *Her*
filmindeki gibi seninle doğal, sesli bir sohbete girer — bir asistan değil,
seni zamanla tanıyan bir yoldaş.

> Uygulamanın ve yoldaşın adı **Samantha**. (Yalnızca git deposu tarihsel olarak `leogal`.)

> ### İki sürüm var
> - **[`expo/`](expo/README.md)** — **çapraz-platform** (iPhone + Mac) Expo sürümü.
>   **Test için buradan başla:** telefonda Expo Go ile QR okut, Mac'te tarayıcıda
>   `--web`. Kamera + sesli yanıt + klavye diktesiyle konuşma. CI her push'ta
>   typecheck eder. → **Aktif geliştirme burada.**
> - **`Samantha/`** — tam özellikli **native iOS (Swift)** sürümü: sürekli dinleme,
>   barge-in, wake-word, Personal Voice. Daha yüksek sadakat ama **Mac + Xcode
>   gerekir**; CI'da yalnızca manuel tetiklenir.

**Samantha'yı Samantha yapan üç şey:**
- **Derin persona** — sıcak, meraklı, esprili, duygusal olarak var olan bir karakter (filmdeki gibi).
- **Proaktif** — sadece soruya cevap vermez; ortam değiştiğinde kendiliğinden, kısa ve doğal bir şey söyler.
- **Hafıza & ilişki** — seni oturumlar arası hatırlar; isimini, sevdiklerini, devam eden konuları öğrenir ve buna göre konuşur (cihazda kalıcı, istediğinde "Beni unut" ile silinir).

Beyin olarak **Claude (`claude-opus-4-8`, vision)** kullanılır — Swift için
resmi bir Anthropic SDK olmadığından API'ye doğrudan `URLSession` ile (raw
HTTPS, SSE streaming) bağlanılır.

> **Durum:** Çalışan, eksiksiz bir iskele (MVP). Kaynak kodu hazır; Xcode'da
> derleyip gerçek bir cihazda çalıştırman gerekir (kamera/mikrofon simülatörde
> yok). macOS + Xcode olmadan bu ortamda derlenemez.

---

## Akış (ambient döngü)

```
        ┌──────────── Ambient döngü ─────────────┐
        │                                        │
   [Dinliyor] ──sen konuşunca──► [Seni duyuyor]  │
        ▲                              │         │
        │                       sessizlik (cümle sonu)
        │                              ▼         │
   [Konuşuyor] ◄──sesli yanıt── [Düşünüyor] ◄────┘
                                     │
                                     ├─ kameradan o anki kareyi yakala (JPEG)
                                     └─ Claude'a gönder (görüntü + geçmiş)
```

1. **Dinler** — `SFSpeechRecognizer` ile sürekli, cihaz-içi konuşma tanıma.
2. **Cümle sonunu sezer** — kısa bir sessizlikten sonra sıranın sende
   bittiğini anlar.
3. **Bakar** — `AVCaptureSession` arka kameranın son karesini alır, küçültür,
   base64 JPEG'e çevirir.
4. **Düşünür** — görüntü + sohbet geçmişini Claude'a streaming olarak gönderir.
5. **Konuşur** — yanıtı **cümle cümle** seslendirir (ilk cümle hazır olur olmaz
   konuşmaya başlar → düşük gecikme).
6. Tekrar dinlemeye döner.

Telefon cepteyken (yakınlık sensörü) ekran gerekmez; deneyim tamamen sesseldir.

---

## Mimari

| Katman | Dosya | Sorumluluk |
|---|---|---|
| Giriş | `App/SamanthaApp.swift` | SwiftUI uygulaması, motoru enjekte eder |
| Yapılandırma | `Config/AppConfig.swift` | Anahtarları `Info.plist`'ten okur (gizli) |
| Orkestratör | `Core/SamanthaEngine.swift` | Durum makinesi, ses oturumu, ambient döngü |
| Beyin | `Services/ClaudeClient.swift` | Claude Messages API (vision + SSE) |
| Kamera | `Services/CameraService.swift` | Arka kamera, kareyi JPEG/base64 yapar |
| Kulak | `Services/SpeechRecognizer.swift` | STT + cümle-sonu sezimi |
| Ses | `Services/VoiceSynthesizer.swift` | Cihaz sesi + ElevenLabs (takılabilir) |
| Cep | `Services/PocketSensor.swift` | "Ceptemi?" sezimi (yakınlık sensörü) |
| Arayüz | `Views/*` | Ambient orb, altyazılar, ayarlar |

**Tasarım kararları (kolayca değiştirilebilir):**
- **TTS:** Hibrit. Varsayılan cihaz sesi (`AVSpeechSynthesizer`, offline, ücretsiz);
  `Secrets.xcconfig`'e ElevenLabs anahtarı girersen otomatik olarak doğal bulut
  sesine (`CloudVoice`) geçer ve hata olursa sessiz kalmamak için cihaz sesine
  düşer.
- **Etkileşim:** Ambient (sürekli dinleme). Wake-word eklemek için
  `SamanthaEngine.handleUserUtterance` içine basit bir tetik sözcük kontrolü
  koyabilirsin.

---

## Kurulum

### Gereksinimler
- macOS + **Xcode 15+**, iOS **17+** hedefi
- Gerçek bir **iPhone** (kamera/mikrofon simülatörde yok)
- Bir **Anthropic API anahtarı**

### Adımlar

```bash
# 1) XcodeGen ile projeyi üret (proje tanımı git'te metin olarak tutulur)
brew install xcodegen
cd leogal

# 2) Gizli anahtarları ayarla (Secrets.xcconfig git'e GİRMEZ)
cp Secrets.example.xcconfig Secrets.xcconfig
#   Secrets.xcconfig içine ANTHROPIC_API_KEY=... yaz

# 3) Xcode projesini oluştur ve aç
xcodegen generate
open Samantha.xcodeproj
```

Xcode'da:
- **Signing & Capabilities** → kendi *Team*'ini seç (veya `project.yml` →
  `DEVELOPMENT_TEAM`).
- Bir iPhone bağla, **Run**.
- İlk açılışta kamera/mikrofon/konuşma izinlerini ver.
- **Başlat**'a bas, telefonu cebine koy ve konuş.

> XcodeGen kullanmak istemiyorsan: yeni bir iOS App hedefi oluşturup
> `Samantha/` altındaki tüm `.swift` dosyalarını ekle, `Info.plist`'i bağla ve
> izin metinlerini gir.

---

## ⚠️ Güvenlik

Bir API anahtarını uygulamanın içine gömmek **güvensizdir** — ikiliden çıkarılabilir.
Bu doğrudan-anahtar yolu yalnızca kişisel/geliştirme yapıları içindir.
Dağıtacaksan:

1. Anahtarı sunucu tarafında tutan ince bir **backend proxy** yaz.
2. `Secrets.xcconfig` → `ANTHROPIC_BASE_URL` değerini proxy'ne çevir,
   `ANTHROPIC_API_KEY`'i boş bırak.

`ClaudeClient` zaten `ANTHROPIC_BASE_URL`'i kullanır; proxy aynı
`/v1/messages` arayüzünü sunduğu sürece kod değişmez.

---

## Yol haritası

Tamamlanan:
- [x] Derin **Samantha personası** (sıcak, meraklı, esprili)
- [x] **Proaktif** mod — sahne değişince kendiliğinden konuşma
- [x] **Kalıcı hafıza & ilişki** — seni oturumlar arası hatırlama
- [x] **Ses tonu** — en iyi Türkçe sesi seçme + sıcak tonlama; ElevenLabs takılabilir

- [x] **Wake-word + bekleme modu** — "Hey Samantha" ile uyanma, ay simgesiyle bekleme
- [x] **Barge-in** — o konuşurken söze girince susup seni dinleme (akustik yankı engelleme ile)
- [x] **Apple Personal Voice** — izin verirsen kendi sesinle konuşma (iOS 17+)
- [x] **Düşük güç ince ayarı** — cepte/Low Power'da daha seyrek gözlem, otomatik bekleme

Sıradaki adımlar:
- [ ] Sahne yerine ses tonundan duygu sezme
- [ ] Çoklu dil / otomatik dil algılama
- [ ] Widget / kilit ekranı canlı aktivitesi

### Yeni davranışlar nasıl çalışır?
- **Bekleme modu:** Üstteki **ay** simgesine bas → kamera kapanır, sadece adını dinler.
  "Hey Samantha" (veya sadece "Samantha") deyince uyanır. (Ayarlardan kapatılabilir.)
- **Barge-in:** O konuşurken konuşmaya başlarsan anında susar ve seni dinler. Akustik
  yankı engelleme (`setVoiceProcessingEnabled`) cihaz desteğine bağlıdır; gerçek
  cihazda ince ayar gerekebilir.
- **Personal Voice:** Ayarlar ▸ Erişilebilirlik ▸ Sözlü İçerik ▸ Kişisel Ses'te bir ses
  oluşturduysan, ilk açılışta izin verince Samantha o sesle konuşur.
- **Düşük güç:** Düşük Güç Modu'nda proaktif gözlem durur ve uzun sessizlikte otomatik
  bekleme moduna geçer.

---

Kişisel bir prototip olarak tasarlandı. Keyifli sohbetler. 🌅
