import * as Speech from "expo-speech";
import { isVoiceConfigured } from "./config";
import * as Eleven from "./elevenlabs";
import { log } from "./log";

/// Speak Romeo's reply. Prefers ElevenLabs (expressive, can laugh); falls
/// back to the on-device voice — stripping audio tags so they aren't read aloud.
export async function speak(text: string): Promise<void> {
  if (isVoiceConfigured()) {
    try {
      await Eleven.speak(text);
      return;
    } catch (e) {
      // Surface why the expressive voice failed before falling back — otherwise
      // a 4xx (bad key/model) looks like "no spoken reply" with no diagnostics.
      log("Eleven sesi düştü, cihaz sesine geçiliyor: " + String(e).slice(0, 140));
    }
  }
  const clean = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const parts = clean.match(/[^.!?…\n]+[.!?…\n]?/g) || [clean];
  for (const part of parts) {
    const s = part.trim();
    if (!s) continue;
    await new Promise<void>((resolve) => {
      Speech.speak(s, {
        language: "tr-TR",
        pitch: 0.9,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }
}

export async function stop(): Promise<void> {
  try { Speech.stop(); } catch {}
  try { await Eleven.stop(); } catch {}
}
