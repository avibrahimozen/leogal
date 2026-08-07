import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { config } from "./config";

/// ElevenLabs: speech-to-text (Scribe) for the user's voice, and expressive
/// text-to-speech (v3) for Romeo — which renders audio tags like [laughs],
/// [giggles], [warm chuckle] as real human sounds.

// --- Speech to text (Scribe) ---
export async function transcribe(fileUri: string): Promise<string> {
  const name = fileUri.split("/").pop() || "audio.m4a";
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "tur");
  // React Native file part:
  form.append("file", { uri: fileUri, name, type: "audio/m4a" } as any);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsKey },
    body: form as any,
  });
  if (!res.ok) throw new Error("STT " + res.status + ": " + (await res.text()));
  const json = await res.json();
  return ((json.text as string) || "").trim();
}

// --- Expressive text to speech ---
let current: Audio.Sound | null = null;

export async function stop(): Promise<void> {
  const s = current;
  current = null;
  if (s) {
    try { await s.stopAsync(); } catch {}
    try { await s.unloadAsync(); } catch {}
  }
}

export async function speak(text: string): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.elevenLabsKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: config.elevenLabsModel,
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error("TTS " + res.status + ": " + (await res.text()));

  const base64 = await blobToBase64(await res.blob());
  const path = (FileSystem.cacheDirectory || "") + "romeo_tts.mp3";
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

  await stop();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
  current = sound;
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) resolve();
      else if (!st.isLoaded && (st as any).error) resolve();
    });
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = (reader.result as string) || "";
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
