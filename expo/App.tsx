import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";

import { RomeoOrb } from "./src/RomeoOrb";
import { SetupCard } from "./src/SetupCard";
import { complete, Msg } from "./src/claude";
import { speak, stop as stopSpeaking } from "./src/voice";
import { transcribe } from "./src/elevenlabs";
import { setLog as installLogSink } from "./src/log";
import { loadMemory, saveMemory, getLastSeen, setLastSeen, MAX_TURNS } from "./src/memory";
import { systemFor, gapNote } from "./src/context";
import { activeCharacter, config, loadKeys, isBrainConfigured, isVoiceConfigured } from "./src/config";

type Status = "listening" | "thinking" | "speaking" | "paused";

// Set false once everything works to hide diagnostics + the test text input.
const DEBUG = true;

// Voice-activity tuning (metering is dBFS, ~0 = loud, -160 = silence).
// The speech threshold ADAPTS to the ambient noise floor sampled at the start
// of each utterance (floor + margin), clamped to a sane range. A fixed -38 was
// too strict — conversational speech often averages ~-45/-50 dBFS, so nothing
// was ever detected and no audio was sent to the APIs.
const VOICE_MARGIN_DB = 12; // how far above the noise floor counts as speech
const VOICE_DB_MIN = -55; // quietest threshold we'll ever require (still rooms)
const VOICE_DB_MAX = -30; // loudest threshold we'll ever require (noisy rooms)
const FLOOR_CALIBRATION_MS = 600; // sample ambient level before listening for speech
const SILENCE_MS = 1100;
const NOSPEECH_MS = 9000;
const MAXUTT_MS = 15000;

// Proactive commenting: during a silent stretch, occasionally look through the
// camera and remark unprompted if the scene meaningfully changed.
const PROACTIVE_MIN_MS = 60000;

export default function App() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const runningRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const historyRef = useRef<Msg[]>([]);
  const meterShownAt = useRef(0);
  const lastProactiveRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null); // cancels an in-flight reply
  const greetedRef = useRef(false);
  const lastSeenRef = useRef<number | null>(null);

  // Remember "now" as the last time this companion was talked to.
  const touchSeen = useCallback(() => {
    const now = Date.now();
    lastSeenRef.current = now;
    void setLastSeen(config.characterId, now);
  }, []);

  const [status, setStatus] = useState<Status>("paused");
  const [micGranted, setMicGranted] = useState(false);
  const [input, setInput] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  // Diagnostics
  const [log, setLog] = useState<string[]>([]);
  const [meter, setMeter] = useState(-160);
  const addLog = useCallback((m: string) => {
    console.log("[Romeo]", m);
    setLog((prev) => [...prev.slice(-7), m]);
  }, []);

  useEffect(() => {
    installLogSink(addLog); // route lower-level (TTS/STT) errors to the HUD
    (async () => {
      addLog("açılış… anahtarlar yükleniyor");
      await loadKeys();
      historyRef.current = await loadMemory(config.characterId);
      lastSeenRef.current = await getLastSeen(config.characterId);
      if (historyRef.current.length) addLog("hafıza: " + historyRef.current.length + " mesaj yüklendi");
      if (!camPermission?.granted) await requestCamPermission();
      const mic = await Audio.requestPermissionsAsync();
      setMicGranted(mic.granted);
      addLog("mic=" + mic.granted + " brain=" + isBrainConfigured() + " voice=" + isVoiceConfigured());
      addLog("anthropic=" + maskKey(config.anthropicKey) + " eleven=" + maskKey(config.elevenLabsKey));
      if (config.anthropicKey.startsWith("sk-ant-oat")) {
        addLog("UYARI: OAuth (sk-ant-oat) token'ı genelde çalışmaz — console.anthropic.com'dan sk-ant-api anahtarı kullan");
      }
      if (!isBrainConfigured()) {
        addLog("anahtar yok — kurulum ekranı açılıyor");
        setShowSetup(true);
        return;
      }
      beginIfReady(mic.granted);
    })();
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start the voice loop when mic + keys are ready; otherwise note why.
  const beginIfReady = useCallback(
    (mic: boolean) => {
      if (mic && isBrainConfigured() && isVoiceConfigured()) startListening();
      else addLog("SES DÖNGÜSÜ BAŞLAMADI (izin/ses anahtarı eksik) — yazarak test edebilirsin");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLog]
  );

  const captureFrame = useCallback(async (): Promise<string | undefined> => {
    if (!camPermission?.granted) return undefined;
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
  }, [camPermission?.granted]);

  // Shared: turn a user message into a spoken reply. Used by both voice + text.
  const respond = useCallback(
    async (text: string) => {
      setStatus("thinking");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const frame = await captureFrame();
        const next = [...historyRef.current, { role: "user", text, image: frame } as Msg];
        // Only the latest turn carries the image to the API.
        const apiHistory = next.map((m, i) => (i === next.length - 1 ? m : { ...m, image: undefined }));
        const reply = await complete(systemFor(activeCharacter().persona), apiHistory, 1024, ctrl.signal);
        // Store text-only, capped — keeps RAM + persisted memory bounded.
        historyRef.current = [
          ...next.map((m) => ({ role: m.role, text: m.text } as Msg)),
          { role: "assistant", text: reply } as Msg,
        ].slice(-MAX_TURNS);
        void saveMemory(config.characterId, historyRef.current);
        touchSeen();
        addLog("yanıt: " + reply.slice(0, 70));
        setStatus("speaking");
        await speak(reply);
        addLog("seslendirme bitti");
      } catch (e) {
        if (ctrl.signal.aborted) addLog("yanıt iptal edildi");
        else addLog("yanıt/ses HATASI: " + String(e));
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [captureFrame, addLog, touchSeen]
  );

  const recordUtterance = useCallback(
    (): Promise<{ uri: string | null; hadSpeech: boolean; maxMeter: number }> =>
      new Promise((resolve) => {
        let done = false;
        let hadSpeech = false;
        let maxMeter = -160;
        let lastVoice = Date.now();
        const start = Date.now();

        // Adaptive threshold: sample the ambient floor first, then require
        // speech to exceed floor + margin (clamped).
        let calibrating = true;
        let floor = 0; // running minimum during calibration
        let threshold = VOICE_DB_MIN;

        const finish = async (speechHeard: boolean) => {
          if (done) return;
          done = true;
          const rec = recordingRef.current;
          recordingRef.current = null;
          let uri: string | null = null;
          try {
            rec?.setOnRecordingStatusUpdate(null);
            await rec?.stopAndUnloadAsync();
            uri = rec?.getURI() ?? null;
          } catch (e) {
            addLog("kayıt durdurma hatası: " + String(e));
          }
          resolve({ uri, hadSpeech: speechHeard, maxMeter });
        };

        (async () => {
          try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const rec = new Audio.Recording();
            recordingRef.current = rec;
            await rec.prepareToRecordAsync({
              ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
              isMeteringEnabled: true,
            });
            rec.setProgressUpdateInterval(150);
            rec.setOnRecordingStatusUpdate((st) => {
              if (!st.isRecording) return;
              const now = Date.now();
              const m = st.metering ?? -160;
              if (m > maxMeter) maxMeter = m;
              if (now - meterShownAt.current > 350) {
                meterShownAt.current = now;
                setMeter(Math.round(m));
              }
              if (calibrating) {
                floor = Math.min(floor, m);
                if (now - start >= FLOOR_CALIBRATION_MS) {
                  calibrating = false;
                  threshold = Math.max(VOICE_DB_MIN, Math.min(VOICE_DB_MAX, floor + VOICE_MARGIN_DB));
                  addLog("eşik: taban=" + Math.round(floor) + " → konuşma>" + Math.round(threshold) + "dB");
                }
              } else if (m > threshold) {
                hadSpeech = true;
                lastVoice = now;
              }
              if (!runningRef.current) return void finish(hadSpeech);
              if (hadSpeech && now - lastVoice > SILENCE_MS) return void finish(true);
              if (!hadSpeech && now - start > NOSPEECH_MS) return void finish(false);
              if (now - start > MAXUTT_MS) return void finish(hadSpeech);
            });
            await rec.startAsync();
          } catch (e) {
            addLog("kayıt başlatma hatası: " + String(e));
            finish(false);
          }
        })();
      }),
    [addLog]
  );

  const stopListening = useCallback(() => {
    runningRef.current = false;
    abortRef.current?.abort();
    void stopSpeaking();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      rec.setOnRecordingStatusUpdate(null);
      rec.stopAndUnloadAsync().catch(() => {});
    }
    setStatus("paused");
  }, []);

  // During a silent stretch, glance through the camera and remark unprompted
  // only if something new/notable appeared (the model gates this via NOCHANGE).
  const proactiveComment = useCallback(async () => {
    if (!camPermission?.granted) return;
    lastProactiveRef.current = Date.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const frame = await captureFrame();
      if (!frame) return;
      setStatus("thinking");
      const probe: Msg = {
        role: "user",
        text:
          "[SESSİZLİK ANI] Kameradan şu anki görüntüye bak. Önceki konuşmaya göre YENİ, " +
          "ilginç ya da dikkat çekici bir şey varsa kendiliğinden, çok kısa (tek cümle) ve " +
          "sıcak bir laf et. Yeni/önemli bir şey yoksa SADECE 'NOCHANGE' yaz, başka hiçbir şey yazma.",
        image: frame,
      };
      const apiHistory = [...historyRef.current, probe].map((m, i, a) =>
        i === a.length - 1 ? m : { ...m, image: undefined }
      );
      const reply = (await complete(systemFor(activeCharacter().persona), apiHistory, 1024, ctrl.signal)).trim();
      if (!runningRef.current || ctrl.signal.aborted) return;
      if (!reply || /nochange/i.test(reply)) {
        addLog("proaktif: değişiklik yok");
        setStatus("listening");
        return;
      }
      historyRef.current = [
        ...historyRef.current,
        { role: "user", text: "(çevreye baktın)" } as Msg,
        { role: "assistant", text: reply } as Msg,
      ].slice(-MAX_TURNS);
      void saveMemory(config.characterId, historyRef.current);
      touchSeen();
      addLog("proaktif: " + reply.slice(0, 60));
      setStatus("speaking");
      await speak(reply);
    } catch (e) {
      if (ctrl.signal.aborted) addLog("proaktif iptal");
      else addLog("proaktif HATA: " + String(e));
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [camPermission?.granted, captureFrame, addLog, touchSeen]);

  // A warm hello when waking — memory-aware (returning vs first meeting).
  const greet = useCallback(async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setStatus("thinking");
      const frame = await captureFrame();
      const returning = historyRef.current.length > 0;
      const promptText = returning
        ? "[UYGULAMA YENİDEN AÇILDI] Beni tanıyorsun. Çok kısa (1-2 cümle), sıcak bir 'tekrar merhaba' " +
          "de; istersen gördüğün ya da hatırladığın bir şeye ufak bir değini. Soru yağmuruna boğma."
        : "[İLK KEZ AÇILDI] Kendini çok kısa tanıt ve sıcacık bir merhaba de (1-2 cümle). Soru yağmuru yok.";
      const probe: Msg = { role: "user", text: promptText, image: frame };
      const apiHistory = [...historyRef.current, probe].map((m, i, a) =>
        i === a.length - 1 ? m : { ...m, image: undefined }
      );
      const system = systemFor(activeCharacter().persona, gapNote(lastSeenRef.current));
      const reply = (await complete(system, apiHistory, 512, ctrl.signal)).trim();
      if (!reply || !runningRef.current) return;
      historyRef.current = [
        ...historyRef.current,
        { role: "user", text: "(uygulamayı açtın)" } as Msg,
        { role: "assistant", text: reply } as Msg,
      ].slice(-MAX_TURNS);
      void saveMemory(config.characterId, historyRef.current);
      touchSeen();
      addLog("selam: " + reply.slice(0, 60));
      setStatus("speaking");
      await speak(reply);
    } catch (e) {
      if (ctrl.signal.aborted) addLog("selam iptal");
      else addLog("selam HATA: " + String(e));
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [captureFrame, addLog, touchSeen]);

  const loop = useCallback(async () => {
    if (!greetedRef.current) {
      greetedRef.current = true;
      await greet();
    }
    while (runningRef.current) {
      setStatus("listening");
      const seg = await recordUtterance();
      if (!runningRef.current) break;
      addLog("segment: konuşma=" + seg.hadSpeech + " maxMeter=" + Math.round(seg.maxMeter) + " uri=" + (seg.uri ? "var" : "yok"));
      if (!seg.uri) {
        // recording failed to produce a file — back off so we don't busy-loop
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (!seg.hadSpeech) {
        // user is quiet — maybe make a spontaneous remark about the scene
        if (Date.now() - lastProactiveRef.current > PROACTIVE_MIN_MS) {
          await proactiveComment();
        }
        continue;
      }

      setStatus("thinking");
      let text = "";
      try {
        text = await transcribe(seg.uri);
        addLog("duydum: " + (text || "(boş)"));
      } catch (e) {
        addLog("STT HATASI: " + String(e));
        continue;
      }
      if (!text) continue;
      if (isStopCommand(text)) {
        addLog("kapatma komutu");
        stopListening();
        return;
      }
      await respond(text);
    }
    setStatus("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordUtterance, respond, proactiveComment, greet, stopListening, addLog]);

  const startListening = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastProactiveRef.current = Date.now(); // don't comment right after waking
    setStatus("listening");
    addLog("dinleme başladı");
    void loop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, addLog]);

  // Text test input: pause the mic loop, send the typed line through respond().
  const sendText = useCallback(async () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    stopListening();
    addLog("yazı: " + t);
    await respond(t);
    setStatus("paused");
  }, [input, respond, stopListening, addLog]);

  const onSetupSaved = useCallback(async () => {
    setShowSetup(false);
    addLog("anahtarlar kaydedildi");
    addLog("anthropic=" + maskKey(config.anthropicKey) + " eleven=" + maskKey(config.elevenLabsKey));
    // Character may have changed — load that companion's own memory + history.
    historyRef.current = await loadMemory(config.characterId);
    lastSeenRef.current = await getLastSeen(config.characterId);
    beginIfReady(micGranted);
  }, [addLog, beginIfReady, micGranted]);

  const notice = !isBrainConfigured()
    ? "Anthropic anahtarı yok — ekrana basılı tutup gir"
    : !isVoiceConfigured()
    ? "Sesli konuşma için ElevenLabs anahtarı gerekli — yazarak test edebilirsin"
    : !micGranted
    ? "Mikrofon izni gerekli — yazarak test edebilirsin"
    : null;

  return (
    <View style={styles.container}>
      {camPermission?.granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      ) : null}

      <RomeoOrb key={config.characterId} palette={activeCharacter().palette} />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          // Barge-in: a tap while speaking cuts the reply and goes back to
          // listening (true talk-over needs echo cancellation → dev build).
          if (status === "speaking") {
            void stopSpeaking();
            addLog("araya girildi");
            return;
          }
          // A tap while thinking cancels the in-flight reply.
          if (status === "thinking") {
            abortRef.current?.abort();
            addLog("düşünme iptal edildi");
            return;
          }
          if (status === "paused" && micGranted && isVoiceConfigured() && isBrainConfigured()) startListening();
        }}
        onLongPress={() => {
          stopListening();
          setShowSetup(true);
        }}
        delayLongPress={600}
      />

      {DEBUG ? (
        <View style={styles.hud} pointerEvents="none">
          <Text style={styles.hudTitle}>
            {status} · mic:{micGranted ? "✓" : "✗"} · ses:{meter}dB
          </Text>
          <ScrollView style={{ maxHeight: 150 }}>
            {log.map((l, i) => (
              <Text key={i} style={styles.hudLine}>
                {l}
              </Text>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.noticeWrap} pointerEvents="none">
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : null}

      {DEBUG ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.inputBar}
        >
          <TextInput
            style={styles.input}
            placeholder={"Test: " + activeCharacter().name + "'a yaz…"}
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendText}
            returnKeyType="send"
          />
          <Pressable style={styles.send} onPress={sendText}>
            <Text style={styles.sendText}>Gönder</Text>
          </Pressable>
        </KeyboardAvoidingView>
      ) : null}

      {showSetup ? <SetupCard onSaved={onSetupSaved} /> : null}
    </View>
  );
}

function isStopCommand(text: string): boolean {
  const t = text.toLocaleLowerCase("tr-TR");
  return (
    t.includes("kapan") ||
    t.includes("dinlemeyi kapat") ||
    t.includes("kendini kapat") ||
    t.includes("dinlemeyi bırak") ||
    t.includes("uyu artık")
  );
}

function maskKey(k: string): string {
  if (!k) return "YOK";
  return k.slice(0, 10) + "…(" + k.length + ")";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050402" },
  noticeWrap: { position: "absolute", left: 24, right: 24, bottom: 84, alignItems: "center" },
  notice: { color: "rgba(255,180,150,0.95)", fontSize: 13, textAlign: "center" },
  hud: {
    position: "absolute",
    top: 50,
    left: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    padding: 8,
  },
  hudTitle: { color: "#ffd68e", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  hudLine: { color: "#e8e8e8", fontSize: 11, lineHeight: 15 },
  inputBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 24,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    color: "#111",
    fontSize: 16,
  },
  send: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  sendText: { color: "#111", fontWeight: "700" },
});
