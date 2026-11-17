import { API_BASE, ApiFailure, authHeaders } from "./api";

export type DraftParts = { en: string; ja: string };

export const splitDraft = (text: string): DraftParts => {
  const i = text.indexOf("===JA===");
  return i === -1 ? { en: text.trim(), ja: "" } : { en: text.slice(0, i).trim(), ja: text.slice(i + 8).trim() };
};

// Reads the /api/ai/draft event stream. EventSource cannot send a POST body, so the frames are parsed by hand.
export async function streamDraft(
  body: { jobId: string; bio: string; tz: string; place: string },
  onText: (parts: DraftParts) => void,
  signal?: AbortSignal,
): Promise<{ source: "ai" | "template"; truncated?: boolean }> {
  const res = await fetch(`${API_BASE}/api/ai/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiFailure(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.message ?? "Drafting failed. Try again.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: ?(.*)$/m.exec(frame)?.[1] ?? "message";
      const data = JSON.parse(/^data: ?(.*)$/m.exec(frame)?.[1] ?? "{}");
      if (event === "delta") {
        full += data.text;
        onText(splitDraft(full));
      } else if (event === "done") {
        return data;
      } else if (event === "error") {
        throw new ApiFailure(200, data.code, data.message);
      }
    }
  }
  throw new ApiFailure(0, "stream_closed", "The connection closed before the draft finished. Try again.");
}
