# Samantha — Expo sürümü (iPhone + Mac) 📱💻

**Mac gerekmez** (test için). Telefonundaki **Expo Go** ile QR okutup anında
çalıştırırsın. Aynı kod **Mac'te tarayıcıda** da çalışır (`--web`).

Kamerayı görür (Claude vision), sesli yanıt verir (Türkçe TTS) ve klavyenin
mikrofon (dikte) tuşuyla ona konuşarak yazarsın.

| Platform | Nasıl | Durum |
|---|---|---|
| **iPhone** | Expo Go ile QR okut | ✅ asıl test yolu |
| **Mac** | Tarayıcıda `npx expo start --web` | ✅ kamera + ses (Web API'leri) |
| **iPhone (App Store derlemesi)** | `eas build` (sonra, Mac'siz de olur) | ⏳ ileride |

| Özellik | Durum |
|---|---|
| Kamerayı görme (vision) | ✅ expo-camera + Claude |
| Sesli yanıt (TTS) | ✅ expo-speech (Türkçe) |
| Ses girişi | ✅ iOS klavyesinin 🎤 dikte tuşuyla (ekstra anahtar yok) |
| Proaktif "göz at" | ✅ 👁️ düğmesi |
| Sürekli dinleme / barge-in | ❌ Expo Go'da yok — native sürüm (`../Samantha`) yapar |

---

## Çalıştırma

```bash
cd expo
npm install
cp .env.example .env          # içine EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-... yaz
npx expo start
```

- **iPhone'da test:** Telefonda **Expo Go** (App Store, ücretsiz) → terminaldeki
  **QR kodu** okut. Kamera iznini ver, yaz/konuş.
- **Mac'te test:** `npx expo start --web` (veya başlattıktan sonra `w`) → tarayıcı
  açılır. Kamera/mikrofon iznini ver.

> **Expo Go sürüm uyumu:** Mağazadaki Expo Go yalnızca en güncel SDK'yı destekler.
> `npx expo start` "SDK uyumsuz" derse, güncel SDK ile sıfırdan iskelet kurup
> kaynakları kopyala:
> ```bash
> npx create-expo-app@latest samantha -t blank-typescript
> cd samantha && npx expo install expo-camera expo-speech
> # sonra bu repodaki App.tsx + src/ + .env'i içine kopyala
> ```

---

## Nasıl kullanılır

- **Yaz veya konuş:** Metin kutusuna yaz ya da iOS klavyesindeki **🎤 dikte** tuşuna
  basıp konuş. "Gönder"e bas.
- **Samantha görür:** Her mesajda kameranın o anki karesini Claude'a yollar.
- **Sesli yanıt:** Cevabı Türkçe sesle okur.
- **👁️ Göz at:** Soru sormadan ortama bakıp kendiliğinden kısa bir yorum yapar
  (söyleyecek bir şey yoksa susar).

---

## Dosyalar

| Dosya | İş |
|---|---|
| `App.tsx` | Ekran: kamera + sohbet + sesli yanıt + göz at |
| `src/config.ts` | `.env`'den anahtar/temel URL/model |
| `src/claude.ts` | Claude Messages API (vision), `fetch` ile |
| `src/speech.ts` | Türkçe TTS, cümle cümle (expo-speech) |
| `src/persona.ts` | Samantha personası + göz-at yönergesi |
| `app.json` / `package.json` / `tsconfig.json` | Expo projesi yapılandırması |

> CI: her push'ta `expo/` TypeScript ile typecheck edilir (`.github/workflows/expo-check.yml`).

---

## Sonraki adımlar

- [ ] Kalıcı hafıza (AsyncStorage) — seni oturumlar arası hatırlama
- [ ] Hold-to-talk ses kaydı + bulut STT (gerçek "konuş-bırak")
- [ ] Otomatik proaktif aralık (timer ile düzenli göz atma)
- [ ] `eas build` ile bağımsız iPhone derlemesi (Mac'siz, EAS bulutunda)
