import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";

import { SamanthaOrb } from "./src/SamanthaOrb";
import { complete, Msg } from "./src/claude";
import { speak, stop as stopSpeaking } from "./src/voice";
import { transcribe } from "./src/elevenlabs";
import { PERSONA } from "./src/persona";
import { isBrainConfigured, isVoiceConfigured } from "./src/config";

type Status = "listening" | "thinking" | "speaking" | "paused";

// Voice-activity tuning (metering is dBFS, ~0 = loud, -160 = silence).
const VOICE_DB = -38; // above this = speech
const SILENCE_MS = 1100; // quiet this long after speech = end of turn
const NOSPEECH_MS = 9000; // pure silence this long = recycle the recording
const MAXUTT_MS = 15000; // hard cap on a single utterance

export default function App() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const runningRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const historyRef = useRef<Msg[]>([]);

  const [status, setStatus] = useState<Status>("paused");
  const [micGranted, setMicGranted] = useState(false);

  // Request camera (vision) + microphone (voice), then start the ambient loop.
  useEffect(() => {
    (async () => {
      if (!camPermission?.granted) await requestCamPermission();
      const mic = await Audio.requestPermissionsAsync();
      setMicGranted(mic.granted);
      if (mic.granted && isBrainConfigured && isVoiceConfigured) {
        startListening();
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

  // Record one utterance: resolves when the user goes quiet (end of turn),
  // hits the max length, or pure silence recycles the buffer.
  const recordUtterance = useCallback(
    (): Promise<{ uri: string | null; hadSpeech: boolean }> =>
      new Promise(async (resolve) => {
        let done = false;
        let hadSpeech = false;
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
          } catch {}
          resolve({ uri, hadSpeech: speechHeard });
        };

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
            if (m > VOICE_DB) {
              hadSpeech = true;
              lastVoice = now;
            }
            if (!runningRef.current) return finish(hadSpeech);
            if (hadSpeech && now - lastVoice > SILENCE_MS) return finish(true);
            if (!hadSpeech && now - start > NOSPEECH_MS) return finish(false);
            if (now - start > MAXUTT_MS) return finish(hadSpeech);
          });
          await rec.startAsync();
        } catch {
          finish(false);
        }
      }),
    []
  );

  const startListening = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("listening");
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

  // The ambient loop: listen → (you stop talking) → think → speak → listen again.
  const loop = useCallback(async () => {
    while (runningRef.current) {
      setStatus("listening");
      const seg = await recordUtterance();
      if (!runningRef.current) break;
      if (!seg.hadSpeech || !seg.uri) continue; // nothing said — keep listening

      setStatus("thinking");
      let text = "";
      try {
        text = await transcribe(seg.uri);
      } catch {}
      if (!text) continue;

      if (isStopCommand(text)) {
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
        if (!runningRef.current) break;
        setStatus("speaking");
        await speak(reply);
      } catch {
        // stay quiet on errors, keep listening
      }
    }
    setStatus("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordUtterance, captureFrame, stopListening]);

  const notice = !isBrainConfigured
    ? "Anthropic API anahtarı ayarlı değil (.env)"
    : !isVoiceConfigured
    ? "Sesle konuşmak için ElevenLabs anahtarı gerekli (.env)"
    : !micGranted
    ? "Mikrofon izni gerekli"
    : null;

  return (
    <View style={styles.container}>
      {/* Hidden camera — Samantha's eyes, always perceiving. Behind the orb. */}
      {camPermission?.granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      ) : null}

      {/* The only thing on screen: the living orb, always animating. */}
      <SamanthaOrb palette="Amber & coral" />

      {/* Tap only to wake her back up after she's been told to stop. */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050402" },
  center: { position: "absolute", left: 24, right: 24, bottom: 64, alignItems: "center" },
  notice: { color: "rgba(255,180,150,0.95)", fontSize: 14, textAlign: "center" },
  paused: { color: "rgba(255,206,168,0.7)", fontSize: 15, textAlign: "center" },
});
