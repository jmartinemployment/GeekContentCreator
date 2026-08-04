"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteContextBanner } from "@/components/SiteContextBanner";
import { getClients, ApiError } from "@/lib/content-writer/api";
import type { Client } from "@/lib/content-writer/types";
import {
  emptyContentBrief,
  loadBriefFromStorage,
  saveBriefToStorage,
} from "@/lib/content-writer/brief-catalog";
import { createGccCreate } from "@/lib/gcc-api";
import {
  clearSiteSectionHandoff,
  readSiteSectionHandoff,
  type SiteSectionHandoff,
} from "@/lib/site-section-storage";
import type { CuratedSerpSeed } from "@/lib/content-writer/serp-lens";

const STARTING_TYPES = [
  { value: "blog", label: "Blog post" },
  { value: "pillar", label: "Pillar" },
  { value: "techArticle", label: "TechArticle" },
  { value: "imagePrompt", label: "Image prompt" },
  { value: "aiTool", label: "AI Tool" },
] as const;

/**
 * Start a Content Creator create. Site Analyzer handoff attaches site section
 * (required non-empty relatedPages) — never keyword-only.
 */
export default function CreateStartForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicFromQuery = searchParams.get("topic")?.trim() ?? "";
  const siteAnalysisIdQuery = searchParams.get("siteAnalysisId")?.trim() ?? "";
  const typeFromQuery = searchParams.get("type")?.trim() ?? "";
  const clientIdFromQuery = searchParams.get("clientId")?.trim() ?? "";
  const suggestPillar = searchParams.get("suggestPillar") === "1";

  const initialType = STARTING_TYPES.some((t) => t.value === typeFromQuery)
    ? typeFromQuery
    : suggestPillar
      ? "pillar"
      : "blog";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(clientIdFromQuery);
  const [topic, setTopic] = useState(topicFromQuery);
  const [startingContentType, setStartingContentType] = useState(initialType);
  const [notes, setNotes] = useState("");
  const [handoff, setHandoff] = useState<SiteSectionHandoff | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getClients()
      .then((list) => {
        setClients(list);
        setClientId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          if (clientIdFromQuery && list.some((c) => c.id === clientIdFromQuery)) {
            return clientIdFromQuery;
          }
          return list[0]?.id ?? "";
        });
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Could not load clients."),
      );
  }, [clientIdFromQuery]);

  useEffect(() => {
    if (topicFromQuery) setTopic(topicFromQuery);
  }, [topicFromQuery]);

  useEffect(() => {
    if (typeFromQuery && STARTING_TYPES.some((t) => t.value === typeFromQuery)) {
      setStartingContentType(typeFromQuery);
    }
  }, [typeFromQuery]);

  useEffect(() => {
    const h = readSiteSectionHandoff();
    setHandoff(h);
    if (h?.gapReason?.trim()) {
      setNotes((prev) => {
        if (prev.trim()) return prev;
        const bits = [`Gap reason: ${h.gapReason!.trim()}`];
        if (h.gapSectionPath?.trim()) bits.push(`Section path: ${h.gapSectionPath.trim()}`);
        return bits.join("\n");
      });
    }
    if (siteAnalysisIdQuery && !h) {
      setError(
        "Site Analyzer create is missing site section context (related pages). Go back to Site Analyzer and pick the gap again.",
      );
    } else if (siteAnalysisIdQuery && h && !h.section.relatedPages?.length) {
      setError(
        "Site Analyzer create requires non-empty relatedPages — cannot start keyword-only.",
      );
    }
  }, [siteAnalysisIdQuery]);

  const saRequired = !!siteAnalysisIdQuery || !!handoff;
  const sectionOk = !!handoff?.section.relatedPages?.length;

  const canSubmit = useMemo(() => {
    if (!clientId || !topic.trim()) return false;
    if (startingContentType === "imagePrompt" && !notes.trim()) return false;
    if (startingContentType === "aiTool" && !notes.trim()) return false;
    if (saRequired && !sectionOk) return false;
    return true;
  }, [clientId, topic, startingContentType, notes, saRequired, sectionOk]);

  function submit() {
    setError(null);
    if (!canSubmit) {
      setError("Fill required fields. Site Analyzer creates need related pages.");
      return;
    }
    startTransition(async () => {
      try {
        const topicTrimmed = topic.trim();
        // Persist curated SERP + gap metadata into local brief storage BEFORE clearing
        // handoff — CreateStartForm clears sessionStorage, so ContentBriefPanel would
        // otherwise never see curatedSerp.
        seedBriefFromHandoff(topicTrimmed, handoff, notes.trim());

        const created = await createGccCreate({
          clientId,
          startingContentType,
          topic: topicTrimmed,
          notes: notes.trim() || null,
          siteAnalysisId:
            handoff?.siteAnalysisId || siteAnalysisIdQuery || null,
          siteSection: handoff?.section ?? null,
        });
        clearSiteSectionHandoff();
        router.push(`/app/creates/${created.id}`);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not start create.",
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Content Creator
      </p>
      <h1 className="mt-1 text-3xl font-bold text-foreground">Start a create</h1>
      <p className="mt-2 text-sm text-muted">
        Owns brief, research, and generate on a Content Creator create — not a
        Content Writer v2 project form-filler. After this step you save the Content
        Brief, then Generate (image prompts still need topic + notes here).
      </p>

      {loadError ? <p className="mt-4 text-sm text-red-600">{loadError}</p> : null}

      {handoff ? <div className="mt-6"><SiteContextBanner siteSection={handoff.section} /></div> : null}

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Client
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            {clients.length === 0 ? (
              <option value="">No clients — create one on Projects</option>
            ) : null}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Starting content
          <select
            value={startingContentType}
            onChange={(e) => setStartingContentType(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            {STARTING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Topic / keyword
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
            placeholder="Target topic"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Notes
          {(startingContentType === "imagePrompt" ||
            startingContentType === "aiTool") && (
            <span className="font-normal text-red-600"> (required)</span>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
            placeholder={
              startingContentType === "imagePrompt"
                ? "Visual context required for standalone image prompt"
                : startingContentType === "aiTool"
                  ? "Short brief for the tool page"
                  : "Optional freeform notes"
            }
          />
        </label>

        <button
          type="button"
          disabled={!canSubmit || pending}
          onClick={submit}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Starting…" : "Continue to Content Brief"}
        </button>
        {error ? (
          <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Merge Site Analyzer handoff into local brief storage so ContentBriefPanel can load it. */
function seedBriefFromHandoff(
  topic: string,
  handoff: SiteSectionHandoff | null,
  createNotes: string,
): void {
  if (!topic) return;
  const existing = loadBriefFromStorage(`kw:${topic}`) ?? emptyContentBrief();
  const noteParts: string[] = [];
  if (existing.writingNotes.trim()) noteParts.push(existing.writingNotes.trim());
  if (createNotes && !noteParts.some((n) => n.includes(createNotes))) {
    noteParts.push(createNotes);
  }
  if (handoff?.gapReason?.trim()) {
    const line = `Gap reason: ${handoff.gapReason.trim()}`;
    if (!noteParts.some((n) => n.includes(line))) noteParts.push(line);
  }
  if (handoff?.gapSectionPath?.trim()) {
    const line = `Section path: ${handoff.gapSectionPath.trim()}`;
    if (!noteParts.some((n) => n.includes(line))) noteParts.push(line);
  }

  const serp: CuratedSerpSeed | null | undefined = handoff?.curatedSerp;
  if (serp?.shapeGuidance?.trim()) {
    const line = `SERP shape: ${serp.shapeGuidance.trim()}`;
    if (!noteParts.some((n) => n.includes("SERP shape:"))) noteParts.push(line);
  }
  if (serp?.informationGainSummary?.trim()) {
    const line = `Information Gain: ${serp.informationGainSummary.trim()}`;
    if (!noteParts.some((n) => n.includes("Information Gain:"))) noteParts.push(line);
  }

  const next = {
    ...existing,
    writingNotes: noteParts.join("\n"),
    serpTitles: existing.serpTitles.trim() || serp?.serpTitles || "",
    serpUrls: existing.serpUrls.trim() || serp?.serpUrls || "",
    paaQuestions: existing.paaQuestions.trim() || serp?.paaQuestions || "",
    relatedSearches: existing.relatedSearches.trim() || serp?.relatedSearches || "",
  };
  saveBriefToStorage(`kw:${topic}`, next);
}
