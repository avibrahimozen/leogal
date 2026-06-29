// Runtime configuration. Keys can come from two places, in priority order:
//   1. Saved in the app (AsyncStorage) — paste them on the setup screen.
//   2. Expo public env vars (`.env`, inlined at build).
// In-app entry exists because `.env` is fragile on Windows; pasting the keys
// once on the device is the most reliable path for Expo Go.
//
// SECURITY: keys stored on the device are personal/Expo Go dev use only.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_ANTHROPIC = "samantha.anthropicKey";
const KEY_ELEVEN = "samantha.elevenKey";
const KEY_VOICE = "samantha.voiceId";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // a warm default

// Mutable runtime config. claude.ts / elevenlabs.ts read these live, so
// updating the fields here takes effect immediately after the user saves keys.
export const config = {
  // Brain (Claude)
  anthropicKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  baseUrl: process.env.EXPO_PUBLIC_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  anthropicVersion: "2023-06-01",
  model: "claude-opus-4-8", // vision-capable

  // Voice in (speech-to-text) + expressive voice out (laughter, warmth).
  elevenLabsKey: process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID,
  elevenLabsModel: process.env.EXPO_PUBLIC_ELEVENLABS_MODEL ?? "eleven_v3", // supports [laughs] tags
};

// Load any keys saved in the app, overriding env defaults when present.
export async function loadKeys(): Promise<void> {
  try {
    const [a, e, v] = await Promise.all([
      AsyncStorage.getItem(KEY_ANTHROPIC),
      AsyncStorage.getItem(KEY_ELEVEN),
      AsyncStorage.getItem(KEY_VOICE),
    ]);
    if (a) config.anthropicKey = a.trim();
    if (e) config.elevenLabsKey = e.trim();
    if (v) config.elevenLabsVoiceId = v.trim();
  } catch {
    // first run / storage unavailable — fall back to env defaults
  }
}

// Persist keys typed on the setup screen and apply them live.
export async function saveKeys(next: {
  anthropicKey?: string;
  elevenLabsKey?: string;
  voiceId?: string;
}): Promise<void> {
  const a = (next.anthropicKey ?? "").trim();
  const e = (next.elevenLabsKey ?? "").trim();
  const v = (next.voiceId ?? "").trim();
  config.anthropicKey = a;
  config.elevenLabsKey = e;
  config.elevenLabsVoiceId = v || DEFAULT_VOICE_ID;
  try {
    await AsyncStorage.multiSet([
      [KEY_ANTHROPIC, a],
      [KEY_ELEVEN, e],
      [KEY_VOICE, config.elevenLabsVoiceId],
    ]);
  } catch {
    // non-fatal: keys still applied in-memory for this session
  }
}

export function isBrainConfigured(): boolean {
  return config.anthropicKey.length > 0 || config.baseUrl !== "https://api.anthropic.com";
}

// Voice interaction (talk + laughter) needs ElevenLabs.
export function isVoiceConfigured(): boolean {
  return config.elevenLabsKey.length > 0;
}
