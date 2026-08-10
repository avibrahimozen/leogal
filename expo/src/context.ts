// Small runtime context appended to the persona so replies fit the moment:
// time of day (greetings/tone) and how long since you last talked.

export function timeContext(now: Date = new Date()): string {
  const h = now.getHours();
  let part = "gece";
  if (h >= 5 && h < 12) part = "sabah";
  else if (h >= 12 && h < 17) part = "öğleden sonra";
  else if (h >= 17 && h < 21) part = "akşam";
  else part = "gece";
  const hh = String(h).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    `[BAĞLAM] Şu an saat ${hh}:${mm}, ${part}. Selam, veda ve tonunu buna göre doğal tut ` +
    `(gece ise daha yumuşak/sakin). Saati rakamla söyleme; sadece hisset.`
  );
}

export function gapNote(lastSeenMs: number | null, now: Date = new Date()): string {
  if (!lastSeenMs) return "";
  const mins = Math.floor((now.getTime() - lastSeenMs) / 60000);
  if (mins < 10) return "";
  if (mins < 60) return `[BAĞLAM] Son konuşmamızdan bu yana ~${mins} dakika geçti.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `[BAĞLAM] Son konuşmamızdan bu yana ~${hrs} saat geçti.`;
  const days = Math.floor(hrs / 24);
  return `[BAĞLAM] Son görüşmemizden bu yana ~${days} gün geçti.`;
}

// Persona + current-moment context, as the system prompt for a call.
export function systemFor(persona: string, extra = ""): string {
  return [persona, timeContext(), extra].filter(Boolean).join("\n\n");
}
