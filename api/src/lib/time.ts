// Same logic as the prototype's liveInfo(); copy this file to web/src/lib/time.ts as well.
export const JST_OFFSET = 540; // minutes east of UTC

export function tzOffsetMin(tz: string, at = new Date()): number {
  try {
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at)) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0; // unknown zone: treat as UTC
  }
}

export const hm = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

export type Verdict = "good" | "warn" | "bad" | "async";

// Converts a JST live window into the viewer's zone and judges how it lands in their day.
export function liveInfo(startJst: number | null, endJst: number | null, tz: string) {
  if (startJst == null || endJst == null) return { verdict: "async" as Verdict, text: "No fixed hours" };
  const len = endJst - startJst;
  const local = (((startJst + tzOffsetMin(tz) - JST_OFFSET) % 1440) + 1440) % 1440;
  const overlap = (lo: number, hi: number) =>
    [[local, local + len], [local - 1440, local + len - 1440]].reduce(
      (t, [a, b]) => t + Math.max(0, Math.min(b, hi) - Math.max(a, lo)), 0);
  const night = overlap(0, 360);
  const edge = overlap(360, 480) + overlap(1320, 1440);
  const verdict: Verdict = night >= len / 2 ? "bad" : night > 0 || edge > 0 ? "warn" : "good";
  return { verdict, startLocal: local, len, text: `${hm(local)}–${hm(local + len)}` };
}
