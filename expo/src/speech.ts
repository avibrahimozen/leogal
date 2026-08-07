import * as Speech from "expo-speech";

/// Speak text aloud in Turkish, sentence-by-sentence so it starts fast and can
/// be stopped cleanly. Resolves when the whole text has been spoken.
export async function speak(text: string): Promise<void> {
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    await new Promise<void>((resolve) => {
      Speech.speak(sentence, {
        language: "tr-TR",
        pitch: 0.9,
        rate: 1.0,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}

// Split without lookbehind (keeps the terminator) for broad engine support.
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?…\n]+[.!?…\n]?/g);
  return (matches ?? [text]).map((s) => s.trim()).filter((s) => s.length > 0);
}
