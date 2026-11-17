import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Row = { id: string; stage: string; titleEn: string; companyEn: string; createdAt: string };
const STAGES = ["sent", "viewed", "interview", "offer"];

export function Applications() {
  const { data, error } = useQuery({ queryKey: ["applications"], queryFn: () => api<{ applications: Row[] }>("/applications") });
  if (error) return <p className="wrap">{(error as Error).message}</p>;
  return (
    <div className="wrap apps">
      <h2>Applications</h2>
      <ul className="apps-sec">
        {(data?.applications ?? []).map((a) => (
          <li key={a.id} className="app">
            <strong>{a.titleEn}</strong> · {a.companyEn}
            <ol className="track">
              {STAGES.map((s, i) => (
                <li key={s} className={i < STAGES.indexOf(a.stage) ? "done" : s === a.stage ? "now" : ""}>{s}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}
