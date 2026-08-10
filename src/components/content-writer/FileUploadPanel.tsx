"use client";

import { useMemo, useState } from "react";
import {
  deleteKeywordSource,
  uploadKeywordSource,
  updateProjectSerpContext,
  ApiError,
} from "@/services/content-writer-api";
import { parseSavedSerp, ApiError as GccApiError } from "@/services/gcc-api";
import {
  buildCuratedSerpSeed,
  curatedSerpHasOrganics,
  type SavedSerpParseResult,
} from "@/lib/content-creator/serp-lens";
import {
  KEYWORD_SOURCE_CATEGORIES,
  type KeywordSourceCategory,
  type KeywordSourceResponse,
  type ProjectDetail,
} from "@/lib/types";

export default function FileUploadPanel({
  projectId,
  targetKeyword,
  keywordSources,
  serpTitles,
  onChanged,
  onProjectUpdated,
}: {
  projectId: string;
  targetKeyword: string;
  keywordSources: KeywordSourceResponse[];
  serpTitles?: string | null;
  onChanged: (sources: KeywordSourceResponse[]) => void;
  onProjectUpdated: (project: ProjectDetail) => void;
}) {
  const [category, setCategory] = useState<KeywordSourceCategory>("KeywordResult");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<SavedSerpParseResult | null>(null);
  const [selectedOrganics, setSelectedOrganics] = useState<Set<number>>(new Set());
  const [selectedPaa, setSelectedPaa] = useState<Set<number>>(new Set());
  const [selectedRelated, setSelectedRelated] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const curatedPreview = useMemo(() => {
    if (!parsed) return null;
    return buildCuratedSerpSeed(parsed, selectedOrganics, selectedPaa, selectedRelated);
  }, [parsed, selectedOrganics, selectedPaa, selectedRelated]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    if (category === "KeywordResult") {
      const file = fileList[0];
      if (!file) return;
      setIsUploading(true);
      try {
        const text = await file.text();
        const result = await parseSavedSerp(text, targetKeyword);
        setPendingFile(file);
        setParsed(result);
        setSelectedOrganics(new Set(result.organics.map((_, i) => i)));
        setSelectedPaa(
          new Set(
            result.peopleAlsoAsk
              .map((q, i) => (q.likelyRelevant ? i : -1))
              .filter((i) => i >= 0),
          ),
        );
        setSelectedRelated(new Set(result.relatedSearches.map((_, i) => i)));
        if (result.organics.length === 0) {
          setError(
            result.parseWarning ??
              "No organic title→URL pairs parsed. Re-save the Google results page (HTML) or try another capture — chrome headings alone are not used.",
          );
        }
      } catch (err) {
        setPendingFile(null);
        setParsed(null);
        setError(
          err instanceof GccApiError || err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "SERP parse failed.",
        );
      } finally {
        setIsUploading(false);
      }
      return;
    }

    setIsUploading(true);
    try {
      const uploaded: KeywordSourceResponse[] = [];
      for (const file of Array.from(fileList)) {
        uploaded.push(await uploadKeywordSource(projectId, category, file));
      }
      onChanged([...keywordSources, ...uploaded]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function confirmSerp() {
    if (!pendingFile || !curatedPreview || !curatedSerpHasOrganics(curatedPreview)) {
      setError("Select at least one organic result before confirming.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const project = await updateProjectSerpContext(projectId, {
        serpTitles: curatedPreview.serpTitles,
        serpUrls: curatedPreview.serpUrls,
        serpPaaQuestions: curatedPreview.paaQuestions || null,
        serpRelatedSearches: curatedPreview.relatedSearches || null,
      });
      onProjectUpdated(project);

      // Keep the raw file on the project for audit; Generate uses curated SERP index, not chrome headings.
      const uploaded = await uploadKeywordSource(projectId, "KeywordResult", pendingFile);
      onChanged([...keywordSources, uploaded]);

      setPendingFile(null);
      setParsed(null);
      setSelectedOrganics(new Set());
      setSelectedPaa(new Set());
      setSelectedRelated(new Set());
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof GccApiError
          ? err.message
          : "Could not save curated SERP index.",
      );
    } finally {
      setConfirming(false);
    }
  }

  function cancelSerp() {
    setPendingFile(null);
    setParsed(null);
    setSelectedOrganics(new Set());
    setSelectedPaa(new Set());
    setSelectedRelated(new Set());
    setError(null);
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
      <h2 className="text-lg font-semibold text-foreground">3. Upload Research Inputs</h2>
      <p className="mt-1 text-sm text-muted">
        Keyword SERP Result: upload a saved Google results page, confirm organic titles/URLs (serp-lens),
        then Generate uses that curated index — not page chrome headings. Wikipedia / .edu / .gov stay
        quotable sources. PAA can be selected from the parse or uploaded as a .txt list.
      </p>

      {serpTitles?.trim() ? (
        <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">Curated SERP titles on this project</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {serpTitles
              .split("\n")
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 8)
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Source Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KeywordSourceCategory)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            disabled={!!parsed}
          >
            {KEYWORD_SOURCE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-brand/50 bg-brand/5 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10">
          {isUploading
            ? category === "KeywordResult"
              ? "Parsing…"
              : "Uploading..."
            : "Choose File(s)"}
          <input
            type="file"
            multiple={category !== "KeywordResult"}
            accept={category === "PeopleAlsoAsk" ? ".txt" : ".html,.htm,.txt,text/html,text/plain"}
            className="hidden"
            disabled={isUploading || confirming || !!parsed}
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {parsed ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">
              Parsed {pendingFile?.name ?? "SERP"} — select items, then confirm
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelSerp}
                disabled={confirming}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSerp()}
                disabled={
                  confirming ||
                  !curatedPreview ||
                  !curatedSerpHasOrganics(curatedPreview)
                }
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {confirming ? "Saving…" : "Confirm SERP index"}
              </button>
            </div>
          </div>

          {parsed.parseWarning ? (
            <p className="text-xs text-amber-800">{parsed.parseWarning}</p>
          ) : null}

          {parsed.organics.length === 0 ? (
            <p className="text-amber-800">
              No organics found — cannot confirm. Re-save the results page and try again.
            </p>
          ) : (
            <SelectionList
              title="Organic results"
              items={parsed.organics.map(
                (o) => `${o.title} — ${o.url}`,
              )}
              selected={selectedOrganics}
              onToggle={(i) => setSelectedOrganics((prev) => toggleSet(prev, i))}
            />
          )}

          {parsed.peopleAlsoAsk.length > 0 ? (
            <SelectionList
              title="People Also Ask (optional)"
              items={parsed.peopleAlsoAsk.map((q) => q.question)}
              selected={selectedPaa}
              onToggle={(i) => setSelectedPaa((prev) => toggleSet(prev, i))}
            />
          ) : null}

          {parsed.relatedSearches.length > 0 ? (
            <SelectionList
              title="Related searches"
              items={parsed.relatedSearches}
              selected={selectedRelated}
              onToggle={(i) => setSelectedRelated((prev) => toggleSet(prev, i))}
            />
          ) : null}
        </div>
      ) : null}

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
                    type="button"
                    onClick={() => void handleDelete(file.id)}
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

function toggleSet(prev: Set<number>, i: number): Set<number> {
  const next = new Set(prev);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
}

function SelectionList({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: string[];
  selected: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
        {items.map((label, i) => (
          <li key={`${i}-${label.slice(0, 40)}`}>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(i)}
                onChange={() => onToggle(i)}
              />
              <span className="break-all">{label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
