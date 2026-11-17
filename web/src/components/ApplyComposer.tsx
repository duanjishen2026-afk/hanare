import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, ApiFailure } from "../lib/api";
import { streamDraft, type DraftParts } from "../lib/sse";

type Props = { jobId: string; bio: string; tz: string; place: string; onSent: () => void };

// Two text boxes (English for the applicant, Japanese for the employer), filled live by the AI draft.
export function ApplyComposer({ jobId, bio, tz, place, onSent }: Props) {
  const [draft, setDraft] = useState<DraftParts>({ en: "", ja: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  async function runDraft() {
    ctl.current = new AbortController();
    setBusy(true);
    setStatus("Thinking…");
    try {
      const r = await streamDraft({ jobId, bio, tz, place }, (parts) => { setDraft(parts); setStatus("Writing…"); }, ctl.current.signal);
      setStatus(
        r.source === "template" ? "Template filled in. Replace the parts in brackets."
        : r.truncated ? "The draft was cut short. Finish the last lines yourself."
        : "Draft ready. Read both versions and edit before sending.",
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus("Stopped. Edit what is there, or draft again.");
      else setStatus(e instanceof ApiFailure ? e.message : "Drafting failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    try {
      await api("/applications", { body: { jobId, messageEn: draft.en, messageJa: draft.ja } });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      onSent();
    } catch (e) {
      setStatus(e instanceof ApiFailure ? e.message : "Sending failed. Try again.");
    }
  }

  return (
    <div className="compose">
      <label htmlFor="msgEn">
        Your message (English)
        <textarea id="msgEn" rows={8} value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
      </label>
      <label htmlFor="msgJa">
        What the employer receives (日本語)
        <textarea id="msgJa" rows={8} lang="ja" value={draft.ja} onChange={(e) => setDraft({ ...draft, ja: e.target.value })} />
      </label>
      <div className="d-actions">
        <button type="button" className="btn" onClick={runDraft} disabled={busy}>{busy ? "Drafting…" : "Draft with AI"}</button>
        {busy && <button type="button" className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
        <button type="button" className="btn primary" onClick={send} disabled={busy}>Send application</button>
      </div>
      <p className="status" aria-live="polite">{status}</p>
    </div>
  );
}
