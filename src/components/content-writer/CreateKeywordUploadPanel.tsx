"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/content-writer/api";
import {
  GCC_KEYWORD_CATEGORIES,
  deleteCreateKeywordSource,
  listCreateKeywordSources,
  uploadCreateKeywordSource,
  type GccKeywordSource,
} from "@/lib/gcc-api";

/**
 * CWv2-style research upload for a Content Creator create. Uploading IS the research action —
 * each file is parsed server-side into the create's ResearchJson, which Generate reads. No
 * follow/process button, no per-file cap. (People-Also-Ask stays in the brief textarea.)
 */
export function CreateKeywordUploadPanel({
  createId,
  ensureCreateId,
}: {
  createId: string | null;
  ensureCreateId: () => Promise<string>;
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
      <p className="text-sm font-medium text-foreground">Research files (article HTML)</p>
      <p className="mt-1 text-xs text-muted">
        Upload saved ranking-article / Wikipedia / .edu / .gov pages (real headings and
        paragraphs). Each file feeds Generate as quoteable research — no cap, no extra step.
        Do not upload Google search-results HTML here — use SERP ingest below.
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

      <ul className="mt-3 space-y-1">
        {sources.length === 0 ? (
          <li className="text-xs text-muted">No research files uploaded yet.</li>
        ) : (
          sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs"
            >
              <span className="truncate">
                <span className="font-medium">{s.fileName}</span>
                <span className="text-muted">
                  {" "}
                  · {s.category} · {s.headingCount} headings · {s.paragraphCount} paragraphs
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="ml-2 shrink-0 text-red-500 hover:underline"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
