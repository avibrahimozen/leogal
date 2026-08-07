# Romeo & Juliette — Expo (orb + sesli ambient) 📱🔮🗣️

**Mac gerekmez.** Telefonda **Expo Go** ile QR okutup çalıştırırsın.

İki yoldaş: **Romeo** (erkek) ve **Juliette** (kadın). İlk açılışta hangisiyle
konuşacağını seçersin — her birinin kendi personası, sesi ve orb rengi vardır.

Ekranda **yalnızca canlı orb animasyonu** döner. Yoldaşın arka kameradan dış
dünyayı sürekli algılar, seni **sürekli dinler** ve konuşarak yanıt verir —
gülerek, sıcak ve insani seslerle. Yalnızca sen sözlü olarak **"kapan" /
"dinlemeyi kapat"** dediğinde durur (sonra ekrana dokunup uyandırırsın).

## Nasıl çalışır
- **Ekran:** tek bir tam ekran **Romeo Orb** (tasarım handoff'unun birebir
  canvas portu, WebView içinde). Buton/yazı/önizleme yok.
- **Dinleme:** sürekli kayıt + ses-seviyesi (metering) ile cümle-sonu sezimi.
  Sustuğunda Romeo düşünür ve yanıtlar, sonra tekrar dinler.
- **Görüş:** arka kamera arka planda hep açık; her turda o anki kareyi
  Claude'a (vision) iletir.
- **Ses:** **ElevenLabs** — konuşma tanıma (Scribe) + ifade dolu seslendirme
  (v3). Romeo'nın `[laughs]`, `[giggles]`, `[warm chuckle]` gibi etiketleri
  **gerçek gülme/insani seslere** dönüşür.
- **Kapatma:** "kapan", "dinlemeyi kapat", "kendini kapat" dersen durur.

## Gerekli anahtarlar (2 tane)
1. **Anthropic** (beyin) — `sk-ant-...` (console.anthropic.com)
2. **ElevenLabs** (ses: konuşma + gülme) — elevenlabs.io → Profile → API key

> ElevenLabs olmadan sesle konuşma çalışmaz (Expo Go'da yerel konuşma tanıma yok).
> Anahtar yoksa ekranda küçük bir uyarı görürsün, orb yine de döner.

## Kurulum: iPhone'a **native uygulama** olarak (Expo Go değil)

iPhone Air'e gerçek bir iOS uygulaması olarak kurmak için **Mac + Xcode** gerekir
(native iOS derlemenin başka yolu yoktur). Uygulama, `expo prebuild` ile üretilen
native iOS projesi üzerinden derlenir — Expo Go'ya gerek kalmaz.

```bash
# Mac'te, bir kez: Xcode'u App Store'dan kur, aç, Command Line Tools'u kabul et.
brew install node watchman cocoapods git   # yoksa

git clone https://github.com/avibrahimozen/leogal.git
cd leogal && git checkout claude/iphone-ar-shirt-pocket-bzovuo
cd expo
npm install

# iPhone'u kabloyla bağla, kilidini aç, "Bu bilgisayara güven" de.
npx expo run:ios --device
```
`run:ios` native projeyi üretir (`expo prebuild`), pod'ları kurar, derler ve
seçtiğin iPhone Air'e yükler.

**İmzalama (ilk sefer):** fiziksel cihaza kurarken bir kez Xcode'da imza gerekir:
```bash
open ios/Romeo.xcworkspace
```
Xcode'da hedefi seç → **Signing & Capabilities** → **Team** olarak kendi Apple
kimliğini seç (ücretsiz hesap yeter, kişisel cihazda 7 günde bir yenilenir) →
tekrar `npx expo run:ios --device`. iPhone'da *Ayarlar → Genel → VPN & Cihaz
Yönetimi*'nden geliştirici sertifikana **güven** demen gerekebilir.

> **Alternatif (Mac yoksa):** EAS Build ile bulutta derleyip kurabilirsin, ama
> cihaza yüklemek Apple Developer üyeliği ister. Mac + ücretsiz Apple kimliği en
> ucuz yoldur.

İlk açılışta **kurulum ekranı** çıkar: **yoldaşını seç** (Romeo / Juliette), iki
anahtarı **yapıştır**, **"Kaydet ve başla"** de. Seçim + anahtarlar cihazda saklanır.
Kamera + mikrofon izinlerini ver, konuşmaya başla.

## Hızlı deneme: Expo Go (opsiyonel)
Native derlemeden önce hızlıca görmek istersen `npx expo start` ile QR'ı Expo Go'da
okutabilirsin — ama kalıcı hedef native iOS uygulamasıdır.

> **Anthropic anahtarı:** klasik `sk-ant-api...` anahtarı kullan (console.anthropic.com).
> Claude Code / `sk-ant-oat...` OAuth token'ları Messages API'de özel persona ile
> genelde **reddedilir** (401/403) — bunu kullanma.
> **ElevenLabs anahtarı zorunlu:** seni duymak (konuşma tanıma) için gerekli;
> Expo Go'da cihaz-içi konuşma tanıma yoktur.

> Anahtarları sonradan değiştirmek istersen **ekrana basılı tut** (long-press) →
> kurulum ekranı yeniden açılır.

### Alternatif: `.env` ile (opsiyonel)
İstersen anahtarları yine de `.env` ile verebilirsin (uygulama içi giriş bunu ezer):
```bash
cp .env.example .env
#   EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
#   EXPO_PUBLIC_ELEVENLABS_API_KEY=...
```

## Dosyalar
| Dosya | İş |
|---|---|
| `App.tsx` | Tam ekran orb + sürekli dinleme döngüsü (adaptif VAD) + gizli kamera |
| `src/characters.ts` | Romeo & Juliette: ad, persona, ses, orb rengi |
| `src/SetupCard.tsx` | İlk açılışta yoldaş seçimi + anahtar girişi (cihazda saklanır) |
| `src/RomeoOrb.tsx` | Nöral-ağ orb (canvas; WebView, web'de iframe) — tasarım birebir |
| `src/elevenlabs.ts` | Scribe (STT) + ifade dolu TTS (gülme; v3→multilingual yedeği) |
| `src/voice.ts` | Ses çıkışı (ElevenLabs; yoksa cihaz sesine düşer) |
| `src/claude.ts` | Claude Messages API (vision) |
| `src/config.ts` / `src/log.ts` | Anahtar/karakter yönetimi · HUD'a hata aktaran logger |

> CI her push'ta `expo/` için typecheck **ve** Metro bundle çalıştırır.

## Ayar (cihazda denerken)
- **Dinleme hassasiyeti:** eşik artık **otomatik** ayarlanır (ortam gürültüsü +
  `VOICE_MARGIN_DB`, `App.tsx`). Erken kesiyorsa `SILENCE_MS`'i (1100) artır;
  hiç duymuyorsa `VOICE_MARGIN_DB`'yi (12) düşür. HUD'da `eşik: taban=… → konuşma>…dB`
  satırından canlı takip edebilirsin.
- **Ses tonu:** kurulum ekranındaki **Voice ID** ile (ya da her karakter için
  `src/characters.ts` içindeki `defaultVoiceId`).
- **Model:** gülme için `eleven_v3` denenir; anahtarında yoksa otomatik
  `eleven_multilingual_v2`'ye düşer (etiketler ayıklanır).

## Sonraki adımlar
- [ ] Konuşurken araya girme (barge-in) — şu an konuşurken dinlemiyor
- [ ] Sahne değişince proaktif yorum (kalıcı görüş)
- [ ] Kalıcı hafıza (AsyncStorage)
