"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ClientsPanel from "@/components/content-writer/ClientsPanel";
import { getClients, ApiError } from "@/services/content-writer-api";
import type { Client } from "@/lib/types";
import { listGccCreates, type GccCreate } from "@/services/gcc-api";

export default function CreatesListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [creates, setCreates] = useState<GccCreate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClients()
      .then((list) => {
        setClients(list);
        if (list[0]) setSelectedClientId(list[0].id);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load clients."),
      );
  }, []);

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

  const visible = selectedClientId
    ? creates.filter((c) => c.clientId === selectedClientId)
    : creates;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Content Creator
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Creates</h1>
        <p className="mt-2 text-sm text-muted">
          Happy path: Site Analyzer → Content Brief → generate → revise / SEO /
          approve / Mix. Start a create by picking a gap in Site Analyzer.
        </p>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="mb-6">
        <ClientsPanel
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={setSelectedClientId}
          onCreated={(client) => {
            setClients((prev) => [...prev, client]);
            setSelectedClientId(client.id);
          }}
        />
      </div>

      {visible.length === 0 && !error ? (
        <p className="text-sm text-muted">
          No creates yet for this client. Pick a gap in Site Analyzer to start one.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/creates/${c.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{c.topic}</p>
                  <p className="text-xs text-muted">
                    {c.startingContentType ?? "no type yet"} · {c.status}
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
