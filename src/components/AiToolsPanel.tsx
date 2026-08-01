"use client";

import { useMemo, useState, useTransition } from "react";

export function AiToolsPanel({
  candidateNames,
  action,
}: {
  candidateNames: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [manual, setManual] = useState("");
  const [brief, setBrief] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(candidateNames.map((n) => [n, false])),
  );

  const picked = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    for (const name of picked) fd.append("selectedNames", name);
    startTransition(() => action(fd));
  }

  return (
    <section className="space-y-3 rounded-md border border-[var(--gcc-line)] bg-white p-4">
      <h2 className="font-display text-xl font-semibold">AI Tools</h2>
      <p className="text-sm text-[var(--gcc-muted)]">
        Context required, source flexible — pick names from this artifact or supply a list + brief.
        Needs at least one tool name to generate.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <input type="hidden" name="brief" value={brief} />
        <input type="hidden" name="manualNames" value={manual} />

        {candidateNames.length > 0 ? (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">From artifact</legend>
            {candidateNames.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selected[name])}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [name]: e.target.checked }))
                  }
                />
                {name}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-xs text-[var(--gcc-muted)]">
            No candidate names detected in the draft — use the human list below.
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Or human-supplied names</span>
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-[var(--gcc-line)] px-3 py-2 text-sm"
            placeholder="One per line or comma-separated"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Brief / angle</span>
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            className="w-full rounded-md border border-[var(--gcc-line)] px-3 py-2 text-sm"
            placeholder="Required when not picking from an artifact with enough context"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--gcc-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate AI Tools"}
        </button>
      </form>
    </section>
  );
}
