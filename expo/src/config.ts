// Configuration read from Expo public env vars (inlined at build from `.env`).
// Copy `.env.example` to `.env` and fill in. See the README.
//
// SECURITY: keys shipped in the app are extractable — fine for personal/Expo Go
// dev use. For production, route through your own backend proxy.

export const config = {
  // Brain (Claude)
  anthropicKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  baseUrl: process.env.EXPO_PUBLIC_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  anthropicVersion: "2023-06-01",
  model: "claude-opus-4-8", // vision-capable

  // Voice in (speech-to-text) + expressive voice out (laughter, warmth):
  // ElevenLabs covers both. Scribe for STT, v3 for laughs/human sounds.
  elevenLabsKey: process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId:
    process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM", // a warm default
  elevenLabsModel: process.env.EXPO_PUBLIC_ELEVENLABS_MODEL ?? "eleven_v3", // supports [laughs] tags
};

export const isBrainConfigured =
  config.anthropicKey.length > 0 || config.baseUrl !== "https://api.anthropic.com";

// Voice interaction (talk + laughter) needs ElevenLabs.
export const isVoiceConfigured = config.elevenLabsKey.length > 0;
