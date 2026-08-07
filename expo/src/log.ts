// Tiny shared logger so lower-level modules (voice/TTS/STT) can surface errors
// to the on-screen HUD instead of swallowing them. App.tsx installs the sink.
let sink: (message: string) => void = () => {};

export function setLog(fn: (message: string) => void): void {
  sink = fn;
}

export function log(message: string): void {
  sink(message);
}
