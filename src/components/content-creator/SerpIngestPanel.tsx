"use client";

import { useMemo, useState } from "react";
import { parseSavedSerp, ApiError } from "@/services/gcc-api";
import {
  buildCuratedSerpSeed,
  type CuratedSerpSeed,
  type PaaCandidate,
  type SavedSerpOrganic,
  type SavedSerpParseResult,
} from "@/lib/content-creator/serp-lens";
import type { InformationGainNote } from "@/lib/types";

export function SerpIngestPanel({
  gapTopic,
  informationGain,
  onCurated,
}: {
  gapTopic: string;
  informationGain?: InformationGainNote | null;
  onCurated: (seed: CuratedSerpSeed | null) => void;
}) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<SavedSerpParseResult | null>(null);
  const [selectedOrganics, setSelectedOrganics] = useState<Set<number>>(new Set());
  const [selectedPaa, setSelectedPaa] = useState<Set<number>>(new Set());
  const [selectedRelated, setSelectedRelated] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runParse(content: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await parseSavedSerp(content, gapTopic);
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
      onCurated(null);
    } catch (e: unknown) {
      setParsed(null);
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "SERP parse failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function onFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRaw(text);
      void runParse(text);
    };
    reader.onerror = () => setError("Could not read file");
    reader.readAsText(file);
  }

  const curatedPreview = useMemo(() => {
    if (!parsed) return null;
    const gain = mergeInformationGain(
      informationGain,
      parsed.organics.filter((_, i) => selectedOrganics.has(i)),
    );
    return buildSeed(
      parsed,
      selectedOrganics,
      selectedPaa,
      selectedRelated,
      gain,
    );
  }, [parsed, selectedOrganics, selectedPaa, selectedRelated, informationGain]);

  function confirm() {
    if (!curatedPreview) return;
    onCurated(curatedPreview);
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-[var(--gcc-line)] bg-[var(--gcc-surface-muted,#f8faf9)] p-4">
      <p className="text-sm font-semibold text-foreground">SERP ingest (saved results page)</p>
      <p className="text-xs text-[var(--gcc-muted)]">
        Run the keyword search in your browser, save the results page, and upload it. Prefer{" "}
        <strong>page 1</strong> for People Also Ask. Confirm the shortlist before start create —
        nothing seeds without your confirm.
      </p>

      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-md border border-[var(--gcc-line)] bg-white px-3 py-1.5 text-xs font-semibold">
          Upload .html / .txt
          <input
            type="file"
            accept=".html,.htm,.txt,text/html,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files)}
          />
        </label>
        <button
          type="button"
          disabled={busy || !raw.trim()}
          onClick={() => void runParse(raw)}
          className="rounded-md border border-[var(--gcc-teal)] px-3 py-1.5 text-xs font-semibold text-[var(--gcc-teal-deep)] disabled:opacity-50"
        >
          {busy ? "Parsing…" : "Parse pasted HTML"}
        </button>
      </div>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={4}
        placeholder="Or paste saved Google results HTML / text here"
        className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-xs font-mono"
      />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {parsed ? (
        <div className="space-y-4 text-sm">
          {parsed.parseWarning ? (
            <p className="text-xs text-amber-800">{parsed.parseWarning}</p>
          ) : null}
          {parsed.missingPaaLikelyPage2 ? (
            <p className="text-xs text-amber-800">
              No PAA extracted — if this was page 2, upload page 1 as well.
            </p>
          ) : null}

          <div>
            <p className="font-medium">SERP shape</p>
            <p className="text-xs text-[var(--gcc-muted)]">{parsed.shape.guidance}</p>
            {parsed.shape.dominantFormats.length > 0 ? (
              <p className="mt-1 text-xs">
                Formats: {parsed.shape.dominantFormats.join(", ")}
              </p>
            ) : null}
          </div>

          {informationGain || parsed ? (
            <div>
              <p className="font-medium">Information Gain</p>
              <p className="text-xs text-[var(--gcc-muted)]">
                {mergeInformationGain(
                  informationGain,
                  parsed.organics.filter((_, i) => selectedOrganics.has(i)),
                ).summary}
              </p>
              {(informationGain?.thisSiteCovers.length ?? 0) > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-[var(--gcc-muted)]">
                  {informationGain!.thisSiteCovers.slice(0, 5).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              {parsed.organics.filter((_, i) => selectedOrganics.has(i)).length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-[var(--gcc-muted)]">
                  {mergeInformationGain(
                    informationGain,
                    parsed.organics.filter((_, i) => selectedOrganics.has(i)),
                  ).competitorOpens.slice(0, 5).map((c) => (
                    <li key={c}>Competitor: {c}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <CandidateList
            title="Organic results"
            items={parsed.organics.map(
              (o: SavedSerpOrganic) => `${o.title} — ${o.url}`,
            )}
            selected={selectedOrganics}
            onToggle={(i) =>
              setSelectedOrganics((prev) => toggleSet(prev, i))
            }
          />

          <CandidateList
            title="People Also Ask"
            items={parsed.peopleAlsoAsk.map(
              (q: PaaCandidate) =>
                `${q.question}${q.likelyRelevant ? "" : " (unchecked — weak relevance)"}`,
            )}
            selected={selectedPaa}
            onToggle={(i) => setSelectedPaa((prev) => toggleSet(prev, i))}
          />

          <CandidateList
            title="Related searches"
            items={parsed.relatedSearches}
            selected={selectedRelated}
            onToggle={(i) => setSelectedRelated((prev) => toggleSet(prev, i))}
          />

          <button
            type="button"
            onClick={confirm}
            disabled={!curatedPreview}
            className="rounded-md bg-[var(--gcc-teal)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirm SERP shortlist for create
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CandidateList({
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
  if (items.length === 0) {
    return (
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-[var(--gcc-muted)]">None extracted</p>
      </div>
    );
  }
  return (
    <div>
      <p className="font-medium">
        {title}{" "}
        <span className="font-normal text-[var(--gcc-muted)]">
          ({selected.size}/{items.length} selected)
        </span>
      </p>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
        {items.map((label, i) => (
          <li key={`${title}-${i}`}>
            <label className="flex cursor-pointer gap-2">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => onToggle(i)}
              />
              <span>{label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toggleSet(prev: Set<number>, i: number): Set<number> {
  const next = new Set(prev);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
}

function buildSeed(
  parsed: SavedSerpParseResult,
  organics: Set<number>,
  paa: Set<number>,
  related: Set<number>,
  informationGain?: InformationGainNote | null,
): CuratedSerpSeed {
  return buildCuratedSerpSeed(parsed, organics, paa, related, {
    informationGainSummary: informationGain?.summary,
  });
}

/** Merge crawl-side Information Gain with competitor opens from curated organics. */
function mergeInformationGain(
  base: InformationGainNote | null | undefined,
  organics: SavedSerpOrganic[],
): InformationGainNote {
  const thisSite = base?.thisSiteCovers ?? [];
  const siteHosts = new Set(
    thisSite
      .map((line) => {
        const m = line.match(/^https?:\/\/([^/\s:]+)/i);
        return m?.[1]?.toLowerCase() ?? null;
      })
      .filter(Boolean) as string[],
  );

  const opens: string[] = [];
  for (const o of organics.slice(0, 10)) {
    try {
      const host = new URL(o.url).host.toLowerCase();
      if (siteHosts.has(host)) continue;
      opens.push(`${o.title} (${o.url})`);
    } catch {
      opens.push(`${o.title} (${o.url})`);
    }
  }

  const summary =
    thisSite.length === 0 && opens.length === 0
      ? base?.summary ??
        "Upload a saved SERP and load section context to build an Information Gain note."
      : opens.length === 0
        ? base?.summary ??
          `This site covers ${thisSite.length} related page(s). Confirm SERP organics to list competitor opens.`
        : `This site covers ${thisSite.length} related page(s); ${opens.length} SERP competitor result(s) to differentiate against.`;

  return {
    thisSiteCovers: thisSite,
    competitorOpens: opens,
    summary,
  };
}
