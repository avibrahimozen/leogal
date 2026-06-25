// Configuration read from Expo public env vars (inlined at build from `.env`).
// Copy `.env.example` to `.env` and fill in your key.
//
// SECURITY: a key shipped in the app is extractable. Fine for personal/Expo Go
// dev use; for anything public, point ANTHROPIC_BASE_URL at your own backend
// proxy that holds the key server-side and leave the key blank.

export const config = {
  anthropicKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  baseUrl: process.env.EXPO_PUBLIC_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  anthropicVersion: "2023-06-01",
  model: "claude-opus-4-8", // vision-capable, latest Opus
};

export const isBrainConfigured =
  config.anthropicKey.length > 0 || config.baseUrl !== "https://api.anthropic.com";
