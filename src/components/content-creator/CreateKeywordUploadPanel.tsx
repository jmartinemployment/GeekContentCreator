"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  GCC_KEYWORD_CATEGORIES,
  deleteCreateKeywordSource,
  listCreateKeywordSources,
  uploadCreateKeywordSource,
  type GccKeywordSource,
} from "@/services/gcc-api";

/**
 * CWv2-style research upload for a Content Creator create. Uploading IS the research action —
 * each file is parsed server-side into the create's ResearchJson, which Generate reads. No
 * follow/process button, no per-file cap.
 *
 * "Keyword result page" (saved Google SERP HTML) is parsed into organics + related searches;
 * Wikipedia/.edu/.gov are parsed as articles into quoteables. PAA stays in the brief textarea —
 * never auto-seeded from any upload. Shape.Guidance (advisory angle signal) is never sent to
 * Generate automatically; the operator adds it to writing notes themselves via "Add to notes".
 */
export function CreateKeywordUploadPanel({
  createId,
  ensureCreateId,
  onAddToNotes,
}: {
  createId: string | null;
  ensureCreateId: () => Promise<string>;
  onAddToNotes: (text: string) => void;
}) {
  const [category, setCategory] = useState(GCC_KEYWORD_CATEGORIES[0].value);
  const [sources, setSources] = useState<GccKeywordSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!createId) return;
    let cancelled = false;
    listCreateKeywordSources(createId)
      .then((s) => {
        if (!cancelled) setSources(s);
      })
      .catch(() => {
        /* first load may 404 before create exists */
      });
    return () => {
      cancelled = true;
    };
  }, [createId]);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const id = await ensureCreateId();
      const added: GccKeywordSource[] = [];
      for (const file of Array.from(fileList)) {
        added.push(await uploadCreateKeywordSource(id, category, file));
      }
      setSources((prev) => [...prev, ...added]);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(sourceId: string) {
    if (!createId) return;
    setError(null);
    try {
      await deleteCreateKeywordSource(createId, sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="rounded-md border border-border bg-white p-4">
      <p className="text-sm font-medium text-foreground">Research files</p>
      <p className="mt-1 text-xs text-muted">
        Upload saved Keyword-result (Google SERP) / Wikipedia / .edu / .gov pages. Each file is
        parsed and used by Generate automatically — no cap, no extra step. PAA stays hand-entered
        below, and Shape guidance below is advisory only — add it to notes yourself if useful.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Source category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            {GCC_KEYWORD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-brand/50 bg-brand/5 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10">
          {busy ? "Uploading…" : "Choose file(s)"}
          <input
            type="file"
            multiple
            accept=".html,.htm,text/html"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <ul className="mt-3 space-y-2">
        {sources.length === 0 ? (
          <li className="text-xs text-muted">No research files uploaded yet.</li>
        ) : (
          sources.map((s) => (
            <li key={s.id} className="rounded border border-border px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="truncate">
                  <span className="font-medium">{s.fileName}</span>
                  <span className="text-muted">
                    {" "}
                    ·{" "}
                    {GCC_KEYWORD_CATEGORIES.find((c) => c.value === s.category)?.label ??
                      s.category}
                    {s.serpPage
                      ? ` · ${s.serpPage.organics.length} organics · ${s.serpPage.relatedSearches.length} related`
                      : ` · ${s.headingCount} headings · ${s.paragraphCount} paragraphs`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="ml-2 shrink-0 text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>

              {s.serpPage ? (
                <div className="mt-2 space-y-2">
                  {s.serpPage.parseWarning ? (
                    <p className="text-amber-700">{s.serpPage.parseWarning}</p>
                  ) : null}

                  {s.serpPage.organics.length > 0 ? (
                    <div>
                      <p className="font-medium text-foreground">Organics</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {s.serpPage.organics.map((o) => (
                          <li key={o.url} className="truncate">
                            {o.title} —{" "}
                            <a
                              href={o.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand underline"
                            >
                              {o.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {s.serpPage.relatedSearches.length > 0 ? (
                    <div>
                      <p className="font-medium text-foreground">Related searches</p>
                      <p className="text-muted">{s.serpPage.relatedSearches.join(" · ")}</p>
                    </div>
                  ) : null}

                  {s.serpPage.shape.guidance ? (
                    <div className="flex items-start justify-between gap-2 rounded bg-surface-muted p-2">
                      <p className="text-muted">
                        <span className="font-medium text-foreground">Shape: </span>
                        {s.serpPage.shape.guidance}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onAddToNotes(`SERP shape (${s.fileName}): ${s.serpPage!.shape.guidance}`)
                        }
                        className="shrink-0 rounded border border-border bg-white px-2 py-1 text-xs font-semibold hover:bg-surface-muted"
                      >
                        Add to notes
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
