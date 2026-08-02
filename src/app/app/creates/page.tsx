"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/content-writer/api";
import { listGccCreates, type GccCreate } from "@/lib/gcc-api";

export default function CreatesListPage() {
  const [creates, setCreates] = useState<GccCreate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGccCreates()
      .then(setCreates)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not list creates.",
        ),
      );
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">
            Content Creator
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Creates</h1>
          <p className="mt-2 text-sm text-muted">
            Brief, research, generate, revise, and approve live on these creates.
          </p>
        </div>
        <Link
          href="/app/create"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Start a create
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {creates.length === 0 && !error ? (
        <p className="text-sm text-muted">No creates yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {creates.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/creates/${c.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{c.topic}</p>
                  <p className="text-xs text-muted">
                    {c.startingContentType} · {c.status}
                    {c.briefJson ? " · brief" : " · brief missing"}
                    {c.siteAnalysisId ? " · Site Analyzer" : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
