import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";

import { SamanthaOrb } from "./src/SamanthaOrb";
import { complete, Msg } from "./src/claude";
import { speak, stop as stopSpeaking } from "./src/voice";
import { transcribe } from "./src/elevenlabs";
import { PERSONA } from "./src/persona";
import { config, isBrainConfigured, isVoiceConfigured } from "./src/config";

type Status = "listening" | "thinking" | "speaking" | "paused";

// Set false once everything works to hide the on-screen diagnostics.
const DEBUG = true;

// Voice-activity tuning (metering is dBFS, ~0 = loud, -160 = silence).
const VOICE_DB = -38;
const SILENCE_MS = 1100;
const NOSPEECH_MS = 9000;
const MAXUTT_MS = 15000;

export default function App() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const runningRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const historyRef = useRef<Msg[]>([]);
  const meterShownAt = useRef(0);

  const [status, setStatus] = useState<Status>("paused");
  const [micGranted, setMicGranted] = useState(false);

  // Diagnostics
  const [log, setLog] = useState<string[]>([]);
  const [meter, setMeter] = useState(-160);
  const addLog = useCallback((m: string) => {
    console.log("[Samantha]", m);
    setLog((prev) => [...prev.slice(-7), m]);
  }, []);

  useEffect(() => {
    (async () => {
      addLog("açılış… izinler isteniyor");
      if (!camPermission?.granted) await requestCamPermission();
      const mic = await Audio.requestPermissionsAsync();
      setMicGranted(mic.granted);
      addLog("mikrofon=" + mic.granted + " brain=" + isBrainConfigured + " voice=" + isVoiceConfigured);
      addLog("anthropic key=" + maskKey(config.anthropicKey) + " eleven=" + maskKey(config.elevenLabsKey));
      if (mic.granted && isBrainConfigured && isVoiceConfigured) {
        startListening();
      } else {
        addLog("LOOP BAŞLAMADI — eksik izin/anahtar");
      }
    })();
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const recordUtterance = useCallback(
    (): Promise<{ uri: string | null; hadSpeech: boolean; maxMeter: number }> =>
      new Promise((resolve) => {
        let done = false;
        let hadSpeech = false;
        let maxMeter = -160;
        let lastVoice = Date.now();
        const start = Date.now();

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
              if (m > VOICE_DB) {
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

  const startListening = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("listening");
    addLog("dinleme başladı");
    void loop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopListening = useCallback(() => {
    runningRef.current = false;
    void stopSpeaking();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      rec.setOnRecordingStatusUpdate(null);
      rec.stopAndUnloadAsync().catch(() => {});
    }
    setStatus("paused");
  }, []);

  const loop = useCallback(async () => {
    while (runningRef.current) {
      setStatus("listening");
      const seg = await recordUtterance();
      if (!runningRef.current) break;
      addLog("segment: konuşma=" + seg.hadSpeech + " maxMeter=" + Math.round(seg.maxMeter) + " uri=" + (seg.uri ? "var" : "yok"));
      if (!seg.hadSpeech || !seg.uri) continue;

      setStatus("thinking");
      let text = "";
      try {
        text = await transcribe(seg.uri);
        addLog("duydum: " + (text || "(boş)"));
      } catch (e) {
        addLog("STT hatası: " + String(e));
        continue;
      }
      if (!text) continue;

      if (isStopCommand(text)) {
        addLog("kapatma komutu");
        stopListening();
        return;
      }

      try {
        const frame = await captureFrame();
        const next = [...historyRef.current, { role: "user", text, image: frame } as Msg];
        historyRef.current = next;
        const apiHistory = next.map((m, i) => (i === next.length - 1 ? m : { ...m, image: undefined }));
        const reply = await complete(PERSONA, apiHistory);
        historyRef.current = [...historyRef.current, { role: "assistant", text: reply }];
        addLog("yanıt: " + reply.slice(0, 60));
        if (!runningRef.current) break;
        setStatus("speaking");
        await speak(reply);
      } catch (e) {
        addLog("yanıt/ses hatası: " + String(e));
      }
    }
    setStatus("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordUtterance, captureFrame, stopListening, addLog]);

  const notice = !isBrainConfigured
    ? "Anthropic API anahtarı ayarlı değil (.env)"
    : !isVoiceConfigured
    ? "Sesle konuşmak için ElevenLabs anahtarı gerekli (.env)"
    : !micGranted
    ? "Mikrofon izni gerekli"
    : null;

  return (
    <View style={styles.container}>
      {camPermission?.granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      ) : null}

      <SamanthaOrb palette="Amber & coral" />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (status === "paused" && !notice) startListening();
        }}
      />

      {notice ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : status === "paused" ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.paused}>Uyuyor — uyandırmak için dokun</Text>
        </View>
      ) : null}

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
  center: { position: "absolute", left: 24, right: 24, bottom: 64, alignItems: "center" },
  notice: { color: "rgba(255,180,150,0.95)", fontSize: 14, textAlign: "center" },
  paused: { color: "rgba(255,206,168,0.7)", fontSize: 15, textAlign: "center" },
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
});
