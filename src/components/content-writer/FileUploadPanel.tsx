"use client";

import { useState } from "react";
import { deleteKeywordSource, uploadKeywordSource, ApiError } from "@/lib/content-writer/api";
import { MAX_QUOTEABLE_RESEARCH_DOCS } from "@/lib/content-writer/brief-catalog";
import {
  KEYWORD_SOURCE_CATEGORIES,
  type KeywordSourceCategory,
  type KeywordSourceResponse,
} from "@/lib/content-writer/types";

const QUOTEABLE_CATEGORIES = new Set<KeywordSourceCategory>([
  "Wikipedia",
  "EduDomain",
  "GovDomain",
]);

export default function FileUploadPanel({
  projectId,
  keywordSources,
  onChanged,
}: {
  projectId: string;
  keywordSources: KeywordSourceResponse[];
  onChanged: (sources: KeywordSourceResponse[]) => void;
}) {
  const [category, setCategory] = useState<KeywordSourceCategory>("KeywordResult");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quoteableCount = keywordSources.filter((k) =>
    QUOTEABLE_CATEGORIES.has(k.category),
  ).length;

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const files = Array.from(fileList);
    if (QUOTEABLE_CATEGORIES.has(category)) {
      const room = MAX_QUOTEABLE_RESEARCH_DOCS - quoteableCount;
      if (room <= 0) {
        setError(
          `Quoteable pages are capped at ${MAX_QUOTEABLE_RESEARCH_DOCS} (Wikipedia / .edu / .gov). Remove one before uploading.`,
        );
        return;
      }
      if (files.length > room) {
        setError(
          `Only ${room} more quoteable page${room === 1 ? "" : "s"} allowed (max ${MAX_QUOTEABLE_RESEARCH_DOCS}).`,
        );
        return;
      }
    }

    setIsUploading(true);
    try {
      const uploaded: KeywordSourceResponse[] = [];
      for (const file of files) {
        uploaded.push(await uploadKeywordSource(projectId, category, file));
      }
      onChanged([...keywordSources, ...uploaded]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteKeywordSource(projectId, id);
    onChanged(keywordSources.filter((k) => k.id !== id));
  }

  const grouped = KEYWORD_SOURCE_CATEGORIES.map((cat) => ({
    ...cat,
    files: keywordSources.filter((k) => k.category === cat.value),
  }));

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Legacy project file uploads</h2>
      <p className="mt-1 text-sm text-muted">
        Optional Content Writer v2 project keyword-sources only. Content Creator Generate uses the
        Content Brief + Follow URLs (deep research) above — not these uploads. Cap for quoteable
        wiki / .edu / .gov files: {MAX_QUOTEABLE_RESEARCH_DOCS}.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Source Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KeywordSourceCategory)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {KEYWORD_SOURCE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-brand/50 bg-brand/5 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10">
          {isUploading ? "Uploading..." : "Choose File(s)"}
          <input
            type="file"
            multiple
            accept={category === "PeopleAlsoAsk" ? ".txt" : ".html,.htm"}
            className="hidden"
            disabled={isUploading}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </label>
      </div>

      {QUOTEABLE_CATEGORIES.has(category) ? (
        <p className="mt-2 text-xs text-muted">
          Quoteable uploads: {quoteableCount} / {MAX_QUOTEABLE_RESEARCH_DOCS}
        </p>
      ) : null}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {grouped.map((group) => (
          <div key={group.value} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{group.label}</span>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                {group.files.length}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {group.files.map((file) => (
                <li key={file.id} className="flex items-center justify-between text-xs text-muted">
                  <span className="truncate">{file.originalFileName}</span>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="ml-2 shrink-0 text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {group.files.length === 0 && <li className="text-xs text-muted/70">No files yet</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
