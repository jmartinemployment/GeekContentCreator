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

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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
      const incoming = Array.from(fileList);
      // Append when already curating so operators can add more SERP pages without Cancel first.
      const byKey = new Map<string, File>();
      for (const f of parsed ? pendingFiles : []) {
        byKey.set(`${f.name}:${f.size}:${f.lastModified}`, f);
      }
      for (const f of incoming) {
        byKey.set(`${f.name}:${f.size}:${f.lastModified}`, f);
      }
      const files = [...byKey.values()];

      setIsUploading(true);
      try {
        const merged = await parseAndMergeKeywordSerpFiles(files, targetKeyword);
        setPendingFiles(files);
        setParsed(merged);
        setSelectedOrganics(new Set(merged.organics.map((_, i) => i)));
        setSelectedPaa(
          new Set(
            merged.peopleAlsoAsk
              .map((q, i) => (q.likelyRelevant ? i : -1))
              .filter((i) => i >= 0),
          ),
        );
        setSelectedRelated(new Set(merged.relatedSearches.map((_, i) => i)));
        if (merged.organics.length === 0) {
          setError(
            merged.parseWarning ??
              "No organic title→URL pairs parsed. Re-save the Google results page (HTML) or try another capture — chrome headings alone are not used.",
          );
        }
      } catch (err) {
        if (!parsed) {
          setPendingFiles([]);
          setParsed(null);
        }
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
    if (
      pendingFiles.length === 0 ||
      !curatedPreview ||
      !curatedSerpHasOrganics(curatedPreview)
    ) {
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

      // Keep raw files on the project for audit; Generate uses curated SERP index, not chrome headings.
      const uploaded: KeywordSourceResponse[] = [];
      for (const file of pendingFiles) {
        uploaded.push(await uploadKeywordSource(projectId, "KeywordResult", file));
      }
      onChanged([...keywordSources, ...uploaded]);

      setPendingFiles([]);
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
    setPendingFiles([]);
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
        Keyword SERP Result: pick one or more saved Google results pages (⌘/Ctrl-click or ⌘/Ctrl-A
        in the file dialog), confirm organic titles/URLs, then Generate uses that curated index —
        not page chrome headings. Wikipedia / .edu / .gov stay quotable sources. PAA can be selected
        from the parse or uploaded as a .txt list.
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
            : parsed
              ? "Add more Keyword SERP file(s)"
              : "Choose File(s)"}
          <input
            type="file"
            multiple
            accept={category === "PeopleAlsoAsk" ? ".txt" : ".html,.htm,.txt,text/html,text/plain"}
            className="hidden"
            disabled={isUploading || confirming}
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {pendingFiles.length > 0 ? (
        <p className="mt-2 text-xs text-muted">
          Pending Keyword SERP file{pendingFiles.length === 1 ? "" : "s"} ({pendingFiles.length}):{" "}
          {pendingFiles.map((f) => f.name).join(", ")}
        </p>
      ) : null}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {parsed ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">
              Parsed{" "}
              {pendingFiles.length === 1
                ? pendingFiles[0]?.name
                : `${pendingFiles.length} files`}{" "}
              — select items, then confirm
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
              items={parsed.organics.map((o) => `${o.title} — ${o.url}`)}
              selected={selectedOrganics}
              onToggle={(i) => setSelectedOrganics((prev) => toggleSet(prev, i))}
              onSelectAll={() =>
                setSelectedOrganics(new Set(parsed.organics.map((_, i) => i)))
              }
              onClear={() => setSelectedOrganics(new Set())}
            />
          )}

          {parsed.peopleAlsoAsk.length > 0 ? (
            <SelectionList
              title="People Also Ask (optional)"
              items={parsed.peopleAlsoAsk.map((q) => q.question)}
              selected={selectedPaa}
              onToggle={(i) => setSelectedPaa((prev) => toggleSet(prev, i))}
              onSelectAll={() =>
                setSelectedPaa(new Set(parsed.peopleAlsoAsk.map((_, i) => i)))
              }
              onClear={() => setSelectedPaa(new Set())}
            />
          ) : null}

          {parsed.relatedSearches.length > 0 ? (
            <SelectionList
              title="Related searches"
              items={parsed.relatedSearches}
              selected={selectedRelated}
              onToggle={(i) => setSelectedRelated((prev) => toggleSet(prev, i))}
              onSelectAll={() =>
                setSelectedRelated(new Set(parsed.relatedSearches.map((_, i) => i)))
              }
              onClear={() => setSelectedRelated(new Set())}
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

async function parseAndMergeKeywordSerpFiles(
  files: File[],
  targetKeyword: string,
): Promise<SavedSerpParseResult> {
  const organics: SavedSerpParseResult["organics"] = [];
  const peopleAlsoAsk: SavedSerpParseResult["peopleAlsoAsk"] = [];
  const relatedSearches: string[] = [];
  const warnings: string[] = [];
  let shape = {
    dominantFormats: [] as string[],
    titlePatterns: [] as string[],
    guidance: "",
    hasPeopleAlsoAsk: false,
    organicCount: 0,
    pageHint: null as string | null,
  };
  let missingPaaLikelyPage2 = false;

  const seenOrganicUrls = new Set<string>();
  const seenPaa = new Set<string>();
  const seenRelated = new Set<string>();

  for (const file of files) {
    const text = await file.text();
    const result = await parseSavedSerp(text, targetKeyword);
    if (result.parseWarning) warnings.push(`${file.name}: ${result.parseWarning}`);
    missingPaaLikelyPage2 = missingPaaLikelyPage2 || result.missingPaaLikelyPage2;
    if (!shape.guidance && result.shape.guidance) shape = { ...result.shape };

    for (const o of result.organics) {
      const key = o.url.trim().toLowerCase();
      if (!key || seenOrganicUrls.has(key)) continue;
      seenOrganicUrls.add(key);
      organics.push({ ...o, position: organics.length + 1 });
    }
    for (const q of result.peopleAlsoAsk) {
      const key = q.question.trim().toLowerCase();
      if (!key || seenPaa.has(key)) continue;
      seenPaa.add(key);
      peopleAlsoAsk.push(q);
    }
    for (const r of result.relatedSearches) {
      const key = r.trim().toLowerCase();
      if (!key || seenRelated.has(key)) continue;
      seenRelated.add(key);
      relatedSearches.push(r);
    }
  }

  shape = {
    ...shape,
    organicCount: organics.length,
    hasPeopleAlsoAsk: peopleAlsoAsk.length > 0,
  };

  return {
    organics,
    peopleAlsoAsk,
    relatedSearches,
    shape,
    missingPaaLikelyPage2,
    parseWarning: warnings.length ? warnings.join(" ") : null,
  };
}

function SelectionList({
  title,
  items,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  title: string;
  items: string[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{title}</p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="font-semibold text-brand hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={selected.size === 0}
            className="font-semibold text-muted hover:underline disabled:cursor-default disabled:no-underline"
          >
            Clear
          </button>
        </div>
      </div>
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
