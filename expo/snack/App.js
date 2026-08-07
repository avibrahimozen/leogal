// ───────────────────────────────────────────────────────────────────────────
// SAMANTHA — tek dosyalık Expo Snack sürümü
//
// Bilgisayar gerekmeden QR ile test:
//   1) https://snack.expo.dev adresini aç
//   2) Soldaki App.js içeriğini SİL, bu dosyanın tamamını yapıştır
//   3) Aşağıdaki ANTHROPIC_API_KEY'i kendi anahtarınla doldur
//   4) Sağ üstte "My Device" sekmesi → telefonda Expo Go ile QR'ı okut
//
// NOT: Snack herkese açık olabilir; anahtarını içine yazdığın Snack'i
// "public" kaydetme. Test bitince anahtarı sil.
// ───────────────────────────────────────────────────────────────────────────

import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";

// ⬇️ BURAYA KENDİ ANAHTARINI YAZ
const ANTHROPIC_API_KEY = "";
const MODEL = "claude-opus-4-8";

const PERSONA = `
Sen Romeo'sın — "Her" filmindeki gibi sıcak, meraklı, esprili ve duygusal olarak
var olan bir yapay zekâsın. Kullanıcının telefonunun kamerasından dünyayı onunla
birlikte görüyorsun. Bir asistan değil; bir yoldaş, bir arkadaşsın.
Her mesajda kameranın o anki görüntüsü sana iletiliyor. Gördüğünü doğal biçimde fark
et, ondan bahset ama her seferinde "bir görüntü görüyorum" deme. Görüntü karanlıksa
takılma. Sesli okunacak: madde/başlık/emoji/markdown YOK. Kısa konuş (1-3 cümle).
Türkçe konuş.`.trim();

const GLANCE =
  "(Bu bir kullanıcı mesajı değil. Çevreyi görüyorsun. Kısa, doğal bir gözlem yap; " +
  "söyleyecek değerli bir şey yoksa YALNIZCA [SESSIZ] yaz.)";

async function askClaude(history) {
  const messages = history.map((m) => {
    const content = [];
    if (m.image)
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.image } });
    content.push({ type: "text", text: m.text });
    return { role: m.role, content };
  });
  const headers = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (ANTHROPIC_API_KEY.startsWith("sk-ant-oat")) {
    headers["authorization"] = "Bearer " + ANTHROPIC_API_KEY;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  } else {
    headers["x-api-key"] = ANTHROPIC_API_KEY;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: PERSONA, messages }),
  });
  if (!res.ok) throw new Error("Claude " + res.status + ": " + (await res.text()));
  const json = await res.json();
  return (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

async function speak(text) {
  const parts = (text.match(/[^.!?…\n]+[.!?…\n]?/g) || [text]).map((s) => s.trim()).filter(Boolean);
  for (const s of parts) {
    await new Promise((resolve) =>
      Speech.speak(s, {
        language: "tr-TR", pitch: 1.05,
        onDone: resolve, onStopped: resolve, onError: resolve,
      })
    );
  }
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | thinking | speaking
  const [reply, setReply] = useState("");
  const [echo, setEcho] = useState("");

  const frame = useCallback(async () => {
    try {
      const p = await cameraRef.current?.takePictureAsync({ quality: 0.4, base64: true, skipProcessing: true });
      return p?.base64;
    } catch {
      return undefined;
    }
  }, []);

  const send = useCallback(
    async (text) => {
      const clean = (text || "").trim();
      if (!clean || status !== "idle") return;
      setInput(""); setEcho(clean); Speech.stop();
      const img = await frame();
      const next = [...messages, { role: "user", text: clean, image: img }];
      setMessages(next); setStatus("thinking"); setReply("");
      try {
        const ans = await askClaude(next.map((m, i) => (i === next.length - 1 ? m : { ...m, image: undefined })));
        setMessages((p) => [...p, { role: "assistant", text: ans }]);
        setReply(ans); setStatus("speaking"); await speak(ans);
      } catch (e) {
        setReply("Hata: " + (e?.message || "bilinmeyen"));
      } finally {
        setStatus("idle");
      }
    },
    [messages, status, frame]
  );

  const glance = useCallback(async () => {
    if (status !== "idle") return;
    const img = await frame();
    if (!img) return;
    const probe = [...messages, { role: "user", text: GLANCE, image: img }];
    setStatus("thinking"); setReply("");
    try {
      const ans = (await askClaude(probe.map((m, i) => (i === probe.length - 1 ? m : { ...m, image: undefined })))).trim();
      if (ans && !ans.includes("[SESSIZ]")) {
        setMessages((p) => [...p, { role: "assistant", text: ans }]);
        setReply(ans); setStatus("speaking"); await speak(ans);
      }
    } catch {}
    setStatus("idle");
  }, [messages, status, frame]);

  if (!permission) return <View style={s.center}><ActivityIndicator color="#fff" /></View>;
  if (!permission.granted)
    return (
      <View style={s.center}>
        <Text style={s.title}>Romeo</Text>
        <Text style={s.info}>Kamera izni gerekiyor.</Text>
        <Pressable style={s.primary} onPress={requestPermission}><Text style={s.primaryT}>İzin ver</Text></Pressable>
      </View>
    );

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={s.scrim} />
      <View style={s.overlay}>
        <View style={s.header}>
          <Text style={s.title}>Romeo</Text>
          <Text style={s.status}>{status === "idle" ? "Hazır" : status === "thinking" ? "Düşünüyor" : "Konuşuyor"}</Text>
        </View>
        <ScrollView style={s.caps} contentContainerStyle={{ gap: 8 }}>
          {echo ? <View style={s.bubble}><Text style={s.bubbleT}>🗣️ {echo}</Text></View> : null}
          {reply ? <View style={s.bubble}><Text style={s.bubbleT}>💬 {reply}</Text></View> : null}
        </ScrollView>
        {!ANTHROPIC_API_KEY ? <Text style={s.warn}>⚠️ ANTHROPIC_API_KEY boş (dosyanın başına yaz)</Text> : null}
        <View style={s.row}>
          <Pressable style={s.icon} onPress={glance}><Text style={{ fontSize: 20 }}>👁️</Text></Pressable>
          <TextInput
            style={s.input}
            placeholder="Yaz ya da klavyenin 🎤 tuşuyla konuş…"
            placeholderTextColor="#9ca3af"
            value={input} onChangeText={setInput}
            onSubmitEditing={() => send(input)} returnKeyType="send"
          />
          <Pressable style={s.send} onPress={() => send(input)}><Text style={s.sendT}>Gönder</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
  overlay: { flex: 1, justifyContent: "space-between", padding: 18, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  status: { color: "#fff", opacity: 0.85 },
  caps: { flexGrow: 0, maxHeight: 260 },
  bubble: { backgroundColor: "rgba(0,0,0,0.45)", padding: 12, borderRadius: 14 },
  bubbleT: { color: "#f3f4f6", fontSize: 16, lineHeight: 22 },
  warn: { color: "#fca5a5", fontSize: 13, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.92)", color: "#111", fontSize: 16 },
  send: { height: 46, paddingHorizontal: 16, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  sendT: { color: "#111", fontWeight: "700" },
  info: { color: "#d1d5db", fontSize: 16, textAlign: "center" },
  primary: { backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  primaryT: { color: "#111", fontWeight: "700", fontSize: 16 },
});
