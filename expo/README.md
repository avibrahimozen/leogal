# Samantha — Expo (orb + sesli ambient) 📱🔮🗣️

**Mac gerekmez.** Telefonda **Expo Go** ile QR okutup çalıştırırsın.

Ekranda **yalnızca canlı orb animasyonu** döner. Samantha arka kameradan dış
dünyayı sürekli algılar, seni **sürekli dinler** ve konuşarak yanıt verir —
gülerek, sıcak ve insani seslerle. Yalnızca sen sözlü olarak **"kapan" /
"dinlemeyi kapat"** dediğinde durur (sonra ekrana dokunup uyandırırsın).

## Nasıl çalışır
- **Ekran:** tek bir tam ekran **Samantha Orb** (tasarım handoff'unun birebir
  canvas portu, WebView içinde). Buton/yazı/önizleme yok.
- **Dinleme:** sürekli kayıt + ses-seviyesi (metering) ile cümle-sonu sezimi.
  Sustuğunda Samantha düşünür ve yanıtlar, sonra tekrar dinler.
- **Görüş:** arka kamera arka planda hep açık; her turda o anki kareyi
  Claude'a (vision) iletir.
- **Ses:** **ElevenLabs** — konuşma tanıma (Scribe) + ifade dolu seslendirme
  (v3). Samantha'nın `[laughs]`, `[giggles]`, `[warm chuckle]` gibi etiketleri
  **gerçek gülme/insani seslere** dönüşür.
- **Kapatma:** "kapan", "dinlemeyi kapat", "kendini kapat" dersen durur.

## Gerekli anahtarlar (2 tane)
1. **Anthropic** (beyin) — `sk-ant-...` (console.anthropic.com)
2. **ElevenLabs** (ses: konuşma + gülme) — elevenlabs.io → Profile → API key

> ElevenLabs olmadan sesle konuşma çalışmaz (Expo Go'da yerel konuşma tanıma yok).
> Anahtar yoksa ekranda küçük bir uyarı görürsün, orb yine de döner.

## Çalıştırma (Windows/Mac/Linux — Mac şart değil)
```bash
cd expo
npm install
npx expo start
```
Telefonda **Expo Go** ile QR'ı okut. **`.env` GEREKMEZ** — uygulama ilk açıldığında
bir **kurulum ekranı** çıkar; iki anahtarı oraya **yapıştır** ve **"Kaydet ve başla"**
de. Anahtarlar cihazda saklanır (bir daha sormaz). Kamera + mikrofon izinlerini ver,
konuşmaya başla.

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
| `App.tsx` | Tam ekran orb + sürekli dinleme döngüsü + gizli kamera |
| `src/SetupCard.tsx` | İlk açılışta anahtar girişi (cihazda saklanır) |
| `src/SamanthaOrb.tsx` | Nöral-ağ orb (canvas, WebView) — tasarım birebir |
| `src/elevenlabs.ts` | Scribe (STT) + ifade dolu TTS (gülme etiketleri) |
| `src/voice.ts` | Ses çıkışı (ElevenLabs; yoksa cihaz sesine düşer) |
| `src/claude.ts` | Claude Messages API (vision; API key + OAuth token destekli) |
| `src/persona.ts` | Samantha personası + ses etiketleri yönergesi |

> CI her push'ta `expo/` için typecheck **ve** Metro bundle çalıştırır.

## Ayar (cihazda denerken)
- **Dinleme hassasiyeti:** `App.tsx` içinde `VOICE_DB` (-38), `SILENCE_MS` (1100).
  Erken kesiyorsa `SILENCE_MS`'i artır; geç algılıyorsa `VOICE_DB`'yi yükselt.
- **Ses tonu:** `.env`'de `EXPO_PUBLIC_ELEVENLABS_VOICE_ID` ile değiştir.
- **Model:** gülme için `EXPO_PUBLIC_ELEVENLABS_MODEL=eleven_v3` (varsayılan).

## Sonraki adımlar
- [ ] Konuşurken araya girme (barge-in) — şu an konuşurken dinlemiyor
- [ ] Sahne değişince proaktif yorum (kalıcı görüş)
- [ ] Kalıcı hafıza (AsyncStorage)
