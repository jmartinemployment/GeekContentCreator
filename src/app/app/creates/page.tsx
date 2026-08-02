"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ClientsPanel from "@/components/content-writer/ClientsPanel";
import { getClients, ApiError } from "@/lib/content-writer/api";
import type { Client } from "@/lib/content-writer/types";
import { listGccCreates, type GccCreate } from "@/lib/gcc-api";

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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">
            Content Creator
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Creates</h1>
          <p className="mt-2 text-sm text-muted">
            Happy path: start create → Content Brief → generate → revise / SEO /
            approve / Mix. Site Analyzer attaches site section on the create.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={
              selectedClientId
                ? `/app/create?type=imagePrompt&clientId=${encodeURIComponent(selectedClientId)}`
                : "/app/create?type=imagePrompt"
            }
            className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/20"
          >
            Image prompt
          </Link>
          <Link
            href={
              selectedClientId
                ? `/app/create?clientId=${encodeURIComponent(selectedClientId)}`
                : "/app/create"
            }
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Start a create
          </Link>
        </div>
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
          No creates yet for this client.{" "}
          <Link
            href={
              selectedClientId
                ? `/app/create?clientId=${encodeURIComponent(selectedClientId)}`
                : "/app/create"
            }
            className="font-semibold text-brand hover:underline"
          >
            Start a create
          </Link>{" "}
          or pick a Site Analyzer gap.
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
