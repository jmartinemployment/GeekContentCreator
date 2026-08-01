"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function GenerateControls({
  createId,
}: {
  createId: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState("OpenAi");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setStatus("Generating…");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/creates/${createId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Generate failed");
        setStatus("Ready");
        router.refresh();
      } catch (e) {
        setStatus(null);
        setError(e instanceof Error ? e.message : "Generate failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-[var(--gcc-muted)]">
        Provider
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={pending}
          className="ml-2 rounded-md border border-[var(--gcc-line)] bg-white px-2 py-2 text-sm text-[var(--gcc-ink)]"
        >
          <option value="OpenAi">OpenAI</option>
          <option value="Anthropic">Claude</option>
        </select>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--gcc-teal-deep)] disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate"}
      </button>
      {status ? (
        <span className="text-xs font-medium text-[var(--gcc-teal-deep)]">{status}</span>
      ) : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
