import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { ApplyComposer } from "../components/ApplyComposer";
import { api } from "../lib/api";
import { liveInfo } from "../lib/time";
import type { Job } from "../types";

// Minimal board: list on the left, the selected job on the right (/jobs/:id deep-links to it).
export function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, isLoading, error } = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: Job[] }>("/jobs") });
  const jobs = data?.jobs ?? [];
  const selected = jobs.find((j) => j.id === id) ?? jobs[0];

  if (isLoading) return <p className="wrap">Loading listings…</p>;
  if (error) return <p className="wrap">Could not load listings: {(error as Error).message}</p>;
  return (
    <div className="wrap board">
      <ul className="list">
        {jobs.map((j) => (
          <li key={j.id}>
            <button type="button" className="row" aria-current={j.id === selected?.id} onClick={() => navigate(`/jobs/${j.id}`)}>
              <span className="row-title">{j.titleEn}</span>
              <span className="row-co">{j.companyEn}</span>
              <span className="live">{liveInfo(j.liveStartMin, j.liveEndMin, tz).text}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <aside className="detail">
          <h2 className="d-title">{selected.titleEn}</h2>
          <p lang="ja">{selected.titleJa}</p>
          <p>{selected.descEn}</p>
          <ApplyComposer key={selected.id} jobId={selected.id} bio="" tz={tz} place={tz} onSent={() => navigate("/applications")} />
        </aside>
      )}
    </div>
  );
}
