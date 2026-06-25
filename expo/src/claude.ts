import { config } from "./config";

export type Msg = { role: "user" | "assistant"; text: string; image?: string };

/// Call the Claude Messages API directly (vision-capable). Native fetch works
/// on Expo Go (it's not a browser, so no CORS). Returns the full reply text.
export async function complete(system: string, history: Msg[], maxTokens = 1024): Promise<string> {
  const messages = history.map((m) => {
    const content: any[] = [];
    if (m.image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: m.image },
      });
    }
    content.push({ type: "text", text: m.text });
    return { role: m.role, content };
  });

  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey,
      "anthropic-version": config.anthropicVersion,
      // Allow direct calls from a browser (Mac/web target). Harmless on native.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: config.model, max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude ${res.status}: ${body}`);
  }

  const json = await res.json();
  return (json.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}
