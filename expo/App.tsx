import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { complete, Msg } from "./src/claude";
import { speak, stopSpeaking } from "./src/speech";
import { PERSONA, GLANCE_INSTRUCTION } from "./src/persona";
import { isBrainConfigured } from "./src/config";

type Status = "idle" | "thinking" | "speaking";

const STATUS_LABEL: Record<Status, string> = {
  idle: "Dinliyor",
  thinking: "Düşünüyor",
  speaking: "Konuşuyor",
};
const STATUS_COLOR: Record<Status, string> = {
  idle: "#22d3ee",
  thinking: "#a78bfa",
  speaking: "#fb923c",
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reply, setReply] = useState("");
  const [userEcho, setUserEcho] = useState("");

  // Grab the current camera frame as a compressed JPEG (base64) for Claude.
  const captureFrame = useCallback(async (): Promise<string | undefined> => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.4,
        base64: true,
        skipProcessing: true,
      });
      return photo?.base64 ?? undefined;
    } catch {
      return undefined;
    }
  }, []);

  // Build the API history: keep the image only on the newest user turn.
  const historyForApi = useCallback(
    (turns: Msg[]): Msg[] => turns.map((m, i) => (i === turns.length - 1 ? m : { ...m, image: undefined })),
    []
  );

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || status !== "idle") return;
      setInput("");
      setUserEcho(clean);
      stopSpeaking();

      const frame = await captureFrame();
      const userMsg: Msg = { role: "user", text: clean, image: frame };
      const next = [...messages, userMsg];
      setMessages(next);
      setStatus("thinking");
      setReply("");

      try {
        const answer = await complete(PERSONA, historyForApi(next));
        setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
        setReply(answer);
        setStatus("speaking");
        await speak(answer);
      } catch (e: any) {
        setReply("Bir şeyler ters gitti: " + (e?.message ?? "bilinmeyen hata"));
      } finally {
        setStatus("idle");
      }
    },
    [messages, status, captureFrame, historyForApi]
  );

  // Proactive "glance": she looks and comments on her own (or stays silent).
  const glance = useCallback(async () => {
    if (status !== "idle") return;
    const frame = await captureFrame();
    if (!frame) return;
    const probe: Msg = { role: "user", text: GLANCE_INSTRUCTION, image: frame };
    setStatus("thinking");
    setReply("");
    try {
      const answer = (await complete(PERSONA, historyForApi([...messages, probe]))).trim();
      if (answer && !answer.includes("[SESSIZ]")) {
        setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
        setReply(answer);
        setStatus("speaking");
        await speak(answer);
      }
    } catch {
      // stay quiet on errors during a glance
    } finally {
      setStatus("idle");
    }
  }, [messages, status, captureFrame, historyForApi]);

  // --- Permission gates ---

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Samantha</Text>
        <Text style={styles.info}>Çevreni görebilmem için kamera iznine ihtiyacım var.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>İzin ver</Text>
        </Pressable>
      </View>
    );
  }

  // --- Main UI ---

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.scrim} />

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Samantha</Text>
          <View style={styles.statusPill}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={styles.statusText}>{STATUS_LABEL[status]}</Text>
          </View>
        </View>

        <ScrollView style={styles.captions} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {userEcho ? <Bubble icon="🗣️" tint="#67e8f9" text={userEcho} /> : null}
          {reply ? <Bubble icon="💬" tint="#fdba74" text={reply} /> : null}
        </ScrollView>

        {!isBrainConfigured ? (
          <Text style={styles.warn}>⚠️ EXPO_PUBLIC_ANTHROPIC_API_KEY ayarlı değil (.env)</Text>
        ) : null}

        <View style={styles.inputRow}>
          <Pressable style={styles.iconBtn} onPress={glance} disabled={status !== "idle"}>
            <Text style={styles.iconBtnText}>👁️</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Yaz ya da klavyenin 🎤 tuşuyla konuş…"
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={status === "idle"}
          />
          <Pressable
            style={[styles.sendBtn, status !== "idle" && styles.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={status !== "idle"}
          >
            <Text style={styles.sendBtnText}>Gönder</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Bubble({ icon, tint, text }: { icon: string; tint: string; text: string }) {
  return (
    <View style={styles.bubble}>
      <Text style={[styles.bubbleIcon, { color: tint }]}>{icon}</Text>
      <Text style={styles.bubbleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
  overlay: { flex: 1, justifyContent: "space-between", padding: 18, paddingTop: 60 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: "#fff", fontSize: 13 },

  captions: { flexGrow: 0, maxHeight: 260 },
  bubble: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 12,
    borderRadius: 14,
  },
  bubbleIcon: { fontSize: 16 },
  bubbleText: { color: "#f3f4f6", fontSize: 16, flex: 1, lineHeight: 22 },

  warn: { color: "#fca5a5", fontSize: 13, marginBottom: 8 },

  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  iconBtnText: { fontSize: 20 },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    color: "#111",
    fontSize: 16,
  },
  sendBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#111", fontWeight: "700" },

  info: { color: "#d1d5db", fontSize: 16, textAlign: "center" },
  primaryBtn: { backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  primaryBtnText: { color: "#111", fontWeight: "700", fontSize: 16 },
});
