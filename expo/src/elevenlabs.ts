import { Audio } from "expo-av";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { activeVoiceId, config } from "./config";
import { log } from "./log";

/// ElevenLabs: speech-to-text (Scribe) for the user's voice, and expressive
/// text-to-speech for the companion — which, on v3, renders audio tags like
/// [laughs], [chuckles], [warm chuckle] as real human sounds.

// A generally-available model to fall back to when the preferred one (e.g.
// eleven_v3, which needs special API access) is rejected. It won't render
// audio tags, so we strip them before sending.
const FALLBACK_MODEL = "eleven_multilingual_v2";

// --- Speech to text (Scribe) ---
export async function transcribe(fileUri: string): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "tur");

  if (Platform.OS === "web") {
    // Web recordings are blob: URLs (webm/ogg) — send a real Blob, not the
    // {uri,name,type} descriptor (which browsers stringify to "[object Object]").
    const blob = await (await fetch(fileUri)).blob();
    form.append("file", blob, "audio.webm");
  } else {
    const name = fileUri.split("/").pop() || "audio.m4a";
    form.append("file", { uri: fileUri, name, type: "audio/m4a" } as any);
  }

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
  let blob: Blob;
  try {
    blob = await fetchTts(text, config.elevenLabsModel);
  } catch (e) {
    // The preferred model (often eleven_v3) may not be available on this key.
    // Retry with a GA model, stripping audio tags it can't render.
    log("TTS(" + config.elevenLabsModel + ") başarısız: " + String(e).slice(0, 140));
    blob = await fetchTts(stripTags(text), FALLBACK_MODEL);
    log("TTS yedek modelle çalındı: " + FALLBACK_MODEL);
  }
  await playBlob(blob);
}

async function fetchTts(text: string, model: string): Promise<Blob> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${activeVoiceId()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.elevenLabsKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error("TTS " + res.status + ": " + (await res.text()));
  return await res.blob();
}

async function playBlob(blob: Blob): Promise<void> {
  // Resolve a playable URI per platform.
  let uri: string;
  let cleanup: () => void = () => {};
  if (Platform.OS === "web") {
    uri = URL.createObjectURL(blob);
    cleanup = () => {
      try { URL.revokeObjectURL(uri); } catch {}
    };
  } else {
    const base64 = await blobToBase64(blob);
    uri = (FileSystem.cacheDirectory || "") + "romeo_tts.mp3";
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  }

  await stop();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

  await new Promise<void>((resolve) => {
    let settled = false;
    let started = false; // becomes true once the sound has actually loaded
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // Attach the status callback via createAsync's 3rd arg so completion of a
    // very short clip is never missed (attaching it after playback can drop it,
    // hanging the await forever).
    Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (st) => {
        if (st.isLoaded) {
          started = true;
          if (st.didJustFinish) done();
        } else {
          if ((st as any).error) log("oynatma durumu hatası: " + String((st as any).error));
          // Unloaded AFTER it started playing = finished or stopped (barge-in);
          // resolve so the loop resumes. Ignore pre-load !isLoaded ticks.
          if (started) done();
        }
      }
    )
      .then(({ sound, status }) => {
        current = sound;
        if (status.isLoaded) {
          started = true;
          if (status.didJustFinish) done();
        }
      })
      .catch((e) => {
        log("oynatma hatası: " + String(e));
        done();
      });
    // Safety net: never stall the voice loop if no completion event arrives.
    setTimeout(done, 20000);
  });

  await stop(); // unload the finished sound before the next record cycle
  cleanup();
}

// Remove [audio tags] for models that would otherwise read them aloud.
function stripTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
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
