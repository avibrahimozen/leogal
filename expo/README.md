# Samantha — Expo Go sürümü 📱

**Mac gerekmez.** Telefonundaki **Expo Go** uygulamasıyla QR okutup anında çalıştırırsın.

Kamerayı görür (Claude vision), sesli yanıt verir (Türkçe TTS) ve klavyenin
mikrofon (dikte) tuşuyla ona konuşarak yazarsın.

| Özellik | Expo Go'da |
|---|---|
| Kamerayı görme (vision) | ✅ expo-camera + Claude |
| Sesli yanıt (TTS) | ✅ expo-speech (Türkçe) |
| Ses girişi | ✅ iOS klavyesinin 🎤 dikte tuşuyla (ekstra anahtar yok) |
| Proaktif "göz at" | ✅ 👁️ düğmesi |
| Sürekli dinleme / barge-in | ❌ Expo Go kum havuzunda yok — native sürüm (`../Samantha`) bunu yapar |

---

## Kurulum (5 dakika, Mac'siz)

Bu klasördeki dosyalar React Native/TypeScript ile yazıldı; çalışması için bir
Expo projesi iskeletine ihtiyaçları var. **Expo Go mağazadaki sürüm yalnızca en
güncel SDK'yı desteklediği için**, projeyi `create-expo-app` ile üretip kaynak
dosyaları içine kopyalamak en güvenli yoldur:

```bash
# 1) Güncel SDK ile boş bir TypeScript Expo projesi oluştur
npx create-expo-app@latest samantha-expo --template blank-typescript
cd samantha-expo

# 2) Gerekli native-uyumlu paketleri SDK'na uygun sürümlerle kur
npx expo install expo-camera expo-speech expo-image-manipulator

# 3) Bu repodaki kaynakları projeye kopyala
#    (App.tsx, src/, .env.example — şu klasörden: leogal/expo/)
cp -R /path/to/leogal/expo/App.tsx .
cp -R /path/to/leogal/expo/src .
cp /path/to/leogal/expo/.env.example .env

# 4) .env içine Anthropic anahtarını yaz
#    EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...

# 5) Başlat
npx expo start
```

Telefonunda **Expo Go**'yu aç (App Store / Play Store'dan ücretsiz), terminaldeki
**QR kodu** okut. Uygulama açılır, kamera iznini ver, yazmaya/konuşmaya başla.

> Bilgisayar yerine doğrudan telefonda dene: `npx expo start` çıktısındaki QR'ı
> **Expo Go** ile tara. (Tarayıcı `w` modunda CORS engeli çıkar — telefonu kullan.)

---

## Nasıl kullanılır

- **Yaz veya konuş:** Metin kutusuna yaz, ya da iOS klavyesindeki **🎤 dikte**
  tuşuna basıp konuş (ücretsiz, cihaz-içi). "Gönder"e bas.
- **Samantha görür:** Her mesajda kameranın o anki karesini Claude'a yollar;
  gördüğü şeyden doğal biçimde bahseder.
- **Sesli yanıt:** Cevabı Türkçe sesle okur.
- **👁️ Göz at:** Bir soru sormadan, ortama bakıp kendiliğinden kısa bir yorum
  yapmasını ister (söyleyecek bir şey yoksa susar).

---

## Dosyalar

| Dosya | İş |
|---|---|
| `App.tsx` | Ekran: kamera + sohbet + sesli yanıt + göz at |
| `src/config.ts` | `.env`'den anahtar/temel URL/model |
| `src/claude.ts` | Claude Messages API (vision), `fetch` ile |
| `src/speech.ts` | Türkçe TTS, cümle cümle (expo-speech) |
| `src/persona.ts` | Samantha personası + göz-at yönergesi |

---

## Sonraki adımlar (Expo tarafı)

- [ ] Kalıcı hafıza (AsyncStorage) — seni oturumlar arası hatırlama
- [ ] Hold-to-talk ses kaydı + bulut STT (gerçek "konuş-bırak")
- [ ] Otomatik proaktif aralık (timer ile düzenli göz atma)
- [ ] Akış (streaming) ile daha hızlı sesli yanıt

> Sürekli-dinleme, barge-in, Personal Voice, wake-word gibi native özellikler
> için kök dizindeki **`../Samantha`** (Swift/iOS) sürümü kullanılır — onun için
> bir Mac gerekir.
