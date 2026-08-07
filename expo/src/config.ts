// Runtime configuration. Keys can come from two places, in priority order:
//   1. Saved in the app (AsyncStorage) — paste them on the setup screen.
//   2. Expo public env vars (`.env`, inlined at build).
// In-app entry exists because `.env` is fragile on Windows; pasting the keys
// once on the device is the most reliable path for Expo Go.
//
// SECURITY: keys stored on the device are personal/Expo Go dev use only.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Character, CharacterId, DEFAULT_CHARACTER, getCharacter } from "./characters";

const KEY_ANTHROPIC = "romeo.anthropicKey";
const KEY_ELEVEN = "romeo.elevenKey";
const KEY_VOICE = "romeo.voiceId"; // optional user override ("" = use character default)
const KEY_CHARACTER = "romeo.characterId";

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
  // Explicit voice override; when empty, the active character's default voice is used.
  voiceOverride: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ?? "",
  elevenLabsModel: process.env.EXPO_PUBLIC_ELEVENLABS_MODEL ?? "eleven_v3", // supports [laughs] tags

  // Which companion is active: "romeo" (male) or "juliette" (female).
  characterId: DEFAULT_CHARACTER as CharacterId,
};

// The active companion (persona, default voice, orb palette).
export function activeCharacter(): Character {
  return getCharacter(config.characterId);
}

// Voice id actually used for TTS: explicit override wins, else character default.
export function activeVoiceId(): string {
  return config.voiceOverride.trim() || activeCharacter().defaultVoiceId;
}

// Load any keys/selection saved in the app, overriding env defaults when present.
export async function loadKeys(): Promise<void> {
  try {
    const [a, e, v, c] = await Promise.all([
      AsyncStorage.getItem(KEY_ANTHROPIC),
      AsyncStorage.getItem(KEY_ELEVEN),
      AsyncStorage.getItem(KEY_VOICE),
      AsyncStorage.getItem(KEY_CHARACTER),
    ]);
    if (a) config.anthropicKey = a.trim();
    if (e) config.elevenLabsKey = e.trim();
    if (v !== null) config.voiceOverride = v.trim();
    if (c === "romeo" || c === "juliette") config.characterId = c;
  } catch {
    // first run / storage unavailable — fall back to env defaults
  }
}

// Persist keys + character chosen on the setup screen and apply them live.
export async function saveKeys(next: {
  anthropicKey?: string;
  elevenLabsKey?: string;
  voiceId?: string;
  characterId?: CharacterId;
}): Promise<void> {
  const a = (next.anthropicKey ?? "").trim();
  const e = (next.elevenLabsKey ?? "").trim();
  const v = (next.voiceId ?? "").trim();
  const c: CharacterId = next.characterId === "juliette" ? "juliette" : "romeo";
  config.anthropicKey = a;
  config.elevenLabsKey = e;
  config.voiceOverride = v;
  config.characterId = c;
  try {
    await AsyncStorage.multiSet([
      [KEY_ANTHROPIC, a],
      [KEY_ELEVEN, e],
      [KEY_VOICE, v],
      [KEY_CHARACTER, c],
    ]);
  } catch {
    // non-fatal: keys still applied in-memory for this session
  }
}

export function isBrainConfigured(): boolean {
  // Base on the actual credential: a non-default base URL must not mask a
  // missing key (that skipped setup and 401'd on the first call).
  return config.anthropicKey.length > 0;
}

// Voice interaction (talk + laughter) needs ElevenLabs.
export function isVoiceConfigured(): boolean {
  return config.elevenLabsKey.length > 0;
}
