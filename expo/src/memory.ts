// Persistent conversation memory so Romeo/Juliette remember you across app
// launches. Stored per character in AsyncStorage. Images are never persisted
// (too large); only the text of each turn is kept, capped to bound token use.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Msg } from "./claude";
import type { CharacterId } from "./characters";

export const MAX_TURNS = 40; // keep the most recent N messages

function key(id: CharacterId): string {
  return "romeo.memory." + id;
}

function sanitize(history: Msg[]): Msg[] {
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text })); // drop images
}

export async function loadMemory(id: CharacterId): Promise<Msg[]> {
  try {
    const raw = await AsyncStorage.getItem(key(id));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? sanitize(arr) : [];
  } catch {
    return [];
  }
}

export async function saveMemory(id: CharacterId, history: Msg[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(id), JSON.stringify(sanitize(history)));
  } catch {
    // non-fatal
  }
}

export async function clearMemory(id: CharacterId): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(id));
  } catch {
    // non-fatal
  }
}
