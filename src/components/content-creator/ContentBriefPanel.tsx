"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUDIENCE_DETAILS,
  AUDIENCE_SEGMENTS,
  BUYING_STAGES,
  CONTENT_ANGLES,
  CTA_TYPES,
  EEAT_SIGNALS,
  PRIMARY_INTENTS,
  SECONDARY_INTENTS,
  TONES_OF_VOICE,
  contentBriefMissingFields,
  emptyContentBrief,
  isContentBriefComplete,
  loadBriefFromStorage,
  migrateBrief,
  saveBriefToStorage,
  toneAllowed,
  LENGTH_BAND_OPTIONS,
  type AudienceDetail,
  type ContentBrief,
  type EeatSignal,
  type LengthBandKey,
} from "@/lib/content-creator/brief-catalog";
import { ApiError } from "@/services/gcc-api";
import {
  GCC_CREATE_STORAGE_PREFIX,
  briefToJson,
  createGccCreate,
  getGccCreate,
  patchBriefResearch,
} from "@/services/gcc-api";
import {
  clearSiteSectionHandoff,
  readSiteSectionHandoff,
} from "@/lib/site-section-storage";
import { applyCuratedSerpToBrief } from "@/lib/content-creator/serp-lens";
import { CreateKeywordUploadPanel } from "./CreateKeywordUploadPanel";

export default function ContentBriefPanel({
  clientId,
  siteAnalysisId,
  targetKeyword,
  createId: createIdProp,
  startingContentType = "blog",
  onBriefSaved,
  onBriefValidityChange,
}: {
  clientId: string;
  siteAnalysisId?: string;
  targetKeyword: string;
  /** When set, brief saves onto this create (does not open a second create). */
  createId?: string | null;
  startingContentType?: string;
  /** Called when brief is persisted on a Content Creator create (server). */
  onBriefSaved: (createId: string, complete: boolean) => void;
  onBriefValidityChange: (complete: boolean) => void;
}) {
  const [brief, setBrief] = useState<ContentBrief>(() => emptyContentBrief());
  const [createId, setCreateId] = useState<string | null>(createIdProp ?? null);
  const [keywordInput, setKeywordInput] = useState(targetKeyword || "");
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (createIdProp) setCreateId(createIdProp);
  }, [createIdProp]);

  useEffect(() => {
    let cancelled = false;
    const stored = loadBriefFromStorage(targetKeyword || "draft");
    const fromKw = loadBriefFromStorage(`kw:${targetKeyword}`);
    let localBrief = fromKw ?? stored ?? emptyContentBrief();

    // Seed from Site Analyzer handoff (gap reason + curated SERP) once — only fill empty fields.
    try {
      const handoff = readSiteSectionHandoff();
      if (handoff) {
        const seedNotes: string[] = [];
        if (handoff.gapReason?.trim()) {
          seedNotes.push(`Gap reason: ${handoff.gapReason.trim()}`);
        }
        if (handoff.gapSectionPath?.trim()) {
          seedNotes.push(`Section path: ${handoff.gapSectionPath.trim()}`);
        }
        if (handoff.curatedSerp?.shapeGuidance?.trim()) {
          seedNotes.push(`SERP shape: ${handoff.curatedSerp.shapeGuidance.trim()}`);
        }
        if (handoff.curatedSerp?.informationGainSummary?.trim()) {
          seedNotes.push(
            `Information Gain: ${handoff.curatedSerp.informationGainSummary.trim()}`,
          );
        }
        if (seedNotes.length && !localBrief.writingNotes.trim()) {
          localBrief = {
            ...localBrief,
            writingNotes: seedNotes.join("\n"),
          };
        }
        const serp = handoff.curatedSerp;
        if (serp) {
          localBrief = {
            ...localBrief,
            serpTitles: localBrief.serpTitles.trim() || serp.serpTitles,
            serpUrls: localBrief.serpUrls.trim() || serp.serpUrls,
            paaQuestions: localBrief.paaQuestions.trim() || serp.paaQuestions,
            relatedSearches:
              localBrief.relatedSearches.trim() || serp.relatedSearches,
          };
        }
      }
    } catch {
      /* ignore */
    }

    setBrief(localBrief);
    saveBriefToStorage(`kw:${targetKeyword}`, localBrief);

    (async () => {
      let cid: string | null = createIdProp ?? null;
      if (!cid) {
        try {
          cid = localStorage.getItem(GCC_CREATE_STORAGE_PREFIX + targetKeyword);
        } catch {
          /* ignore */
        }
      }
      if (cid) {
        setCreateId(cid);
        try {
          const create = await getGccCreate(cid);
          if (cancelled) return;
          if (create.briefJson) {
            try {
              const parsed = migrateBrief(JSON.parse(create.briefJson));
              // Prefer server brief, but keep locally seeded SERP/notes if server fields are empty.
              const merged = {
                ...parsed,
                serpTitles: parsed.serpTitles.trim() || localBrief.serpTitles,
                serpUrls: parsed.serpUrls.trim() || localBrief.serpUrls,
                paaQuestions: parsed.paaQuestions.trim() || localBrief.paaQuestions,
                relatedSearches:
                  parsed.relatedSearches.trim() || localBrief.relatedSearches,
                writingNotes: parsed.writingNotes.trim() || localBrief.writingNotes,
              };
              setBrief(merged);
              saveBriefToStorage(`kw:${targetKeyword}`, merged);
            } catch {
              /* keep local brief */
            }
            onBriefSaved(cid, true);
          } else {
            // No server brief yet — keep Site Analyzer–seeded local brief.
            onBriefSaved(cid, false);
          }
        } catch {
          if (!cancelled) onBriefSaved(cid, false);
        }
      }
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
    // onBriefSaved is stable enough from parent; avoid re-hydrate loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKeyword, createIdProp]);

  const missing = useMemo(() => contentBriefMissingFields(brief), [brief]);
  const complete = missing.length === 0;

  useEffect(() => {
    if (!hydrated) return;
    onBriefValidityChange(complete);
  }, [hydrated, complete, onBriefValidityChange]);

  function persistLocal(next: ContentBrief) {
    saveBriefToStorage(`kw:${targetKeyword}`, next);
  }

  function patch(partial: Partial<ContentBrief>) {
    setBrief((prev) => {
      let next = { ...prev, ...partial };
      // If a newly chosen intent/angle disqualifies the current tone, clear it.
      if (
        (partial.primaryIntent !== undefined || partial.angle !== undefined) &&
        next.toneOfVoice &&
        !toneAllowed(next.toneOfVoice, next.primaryIntent, next.angle)
      ) {
        next = { ...next, toneOfVoice: "" };
      }
      persistLocal(next);
      return next;
    });
    setSavedMsg(null);
  }

  function toggleDetail(value: AudienceDetail) {
    setBrief((prev) => {
      const has = prev.audienceDetails.includes(value);
      const audienceDetails = has
        ? prev.audienceDetails.filter((m) => m !== value)
        : [...prev.audienceDetails, value];
      const next = { ...prev, audienceDetails };
      persistLocal(next);
      return next;
    });
    setSavedMsg(null);
  }

  function toggleEeat(value: EeatSignal) {
    setBrief((prev) => {
      const has = prev.eeatSignals.includes(value);
      const eeatSignals = has
        ? prev.eeatSignals.filter((s) => s !== value)
        : [...prev.eeatSignals, value];
      const next = { ...prev, eeatSignals };
      persistLocal(next);
      return next;
    });
    setSavedMsg(null);
  }

  async function ensureCreateId(): Promise<string> {
    if (createId) return createId;
    const handoff = readSiteSectionHandoff();
    if (handoff && !handoff.section.relatedPages?.length) {
      throw new ApiError(
        "Site Analyzer create requires non-empty relatedPages in site section context.",
        400,
      );
    }
    const created = await createGccCreate({
      clientId,
      startingContentType,
      topic: keywordInput.trim() || "untitled",
      siteAnalysisId: siteAnalysisId || handoff?.siteAnalysisId || null,
      siteSection: handoff?.section ?? null,
    });
    if (handoff) clearSiteSectionHandoff();
    setCreateId(created.id);
    try {
      localStorage.setItem(GCC_CREATE_STORAGE_PREFIX + keywordInput, created.id);
    } catch {
      /* ignore */
    }
    return created.id;
  }

  async function handleSaveBrief() {
    setError(null);
    setSavedMsg(null);
    if (!isContentBriefComplete(brief)) {
      setError(`Required: ${missing.join(", ")}`);
      return;
    }
    setIsSaving(true);
    try {
      const id = await ensureCreateId();
      await patchBriefResearch(id, { briefJson: briefToJson(brief) });
      setSavedMsg("Brief saved on Content Creator create.");
      onBriefSaved(id, true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save brief.",
      );
      onBriefSaved(createId ?? "", false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm text-muted">Loading content brief…</p>
      </div>
    );
  }

  const fieldClass =
    "rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
  const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-foreground";
  const requiredMark = (ok: boolean) =>
    ok ? null : <span className="text-red-600"> (required)</span>;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Content Brief</h2>
      <p className="mt-1 text-sm text-muted">
        Controls aligned to Google Search &amp; Ads terminology. Saved on the Content Creator
        create (GeekAPI); Generate reads server state only. Fail closed: Generate stays disabled
        until required fields are saved.
      </p>

      <div className="mt-5">
        <label className={labelClass}>
          Target keyword{requiredMark(!!keywordInput)}
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="e.g., 'Best AI tools for content creation'"
            className={fieldClass}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Primary intent{requiredMark(!!brief.primaryIntent)}
          <select
            value={brief.primaryIntent}
            onChange={(e) =>
              patch({ primaryIntent: e.target.value as ContentBrief["primaryIntent"] })
            }
            className={fieldClass}
          >
            <option value="">Select primary intent</option>
            {PRIMARY_INTENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Secondary intent (optional)
          <select
            value={brief.secondaryIntent}
            onChange={(e) =>
              patch({ secondaryIntent: e.target.value as ContentBrief["secondaryIntent"] })
            }
            className={fieldClass}
          >
            <option value="">None</option>
            {SECONDARY_INTENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Buying stage (Full Funnel){requiredMark(!!brief.buyingStage)}
          <select
            value={brief.buyingStage}
            onChange={(e) =>
              patch({ buyingStage: e.target.value as ContentBrief["buyingStage"] })
            }
            className={fieldClass}
          >
            <option value="">Select buying stage</option>
            {BUYING_STAGES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Google Ads Full-Funnel objective.
          </span>
        </label>

        <label className={labelClass}>
          Audience segment{requiredMark(!!brief.audienceSegment)}
          <select
            value={brief.audienceSegment}
            onChange={(e) =>
              patch({
                audienceSegment: e.target.value as ContentBrief["audienceSegment"],
              })
            }
            className={fieldClass}
          >
            <option value="">Select audience segment</option>
            {AUDIENCE_SEGMENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">Google Ads audience segments.</span>
        </label>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Audience details (optional)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCE_DETAILS.map((m) => {
              const on = brief.audienceDetails.includes(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => toggleDetail(m.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    on
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-white text-muted"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className={`${labelClass} sm:col-span-2`}>
          Audience notes{requiredMark(!!brief.audienceNotes.trim())}
          <textarea
            value={brief.audienceNotes}
            onChange={(e) => patch({ audienceNotes: e.target.value })}
            rows={2}
            placeholder="Concrete audience notes — these win if they conflict with the segment"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Angle for SEO{requiredMark(!!brief.angle)}
          <select
            value={brief.angle}
            onChange={(e) =>
              patch({ angle: e.target.value as ContentBrief["angle"] })
            }
            className={fieldClass}
          >
            <option value="">Select angle</option>
            {CONTENT_ANGLES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">
            Editorial choice — match the dominant SERP format.
          </span>
        </label>

        <label className={labelClass}>
          Discovery CTA type{requiredMark(!!brief.ctaType)}
          <select
            value={brief.ctaType}
            onChange={(e) =>
              patch({ ctaType: e.target.value as ContentBrief["ctaType"] })
            }
            className={fieldClass}
          >
            <option value="">Select CTA type</option>
            {CTA_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={`${labelClass} sm:col-span-2`}>
          CTA label (optional)
          <input
            value={brief.ctaLabel}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Length{requiredMark(!!brief.lengthBand)}
          <select
            value={brief.lengthBand}
            onChange={(e) =>
              patch({ lengthBand: e.target.value as LengthBandKey | "" })
            }
            className={fieldClass}
          >
            <option value="">Select length band</option>
            {LENGTH_BAND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <label className={labelClass}>
          Tone of voice{requiredMark(!!brief.toneOfVoice)}
          <select
            value={brief.toneOfVoice}
            onChange={(e) =>
              patch({ toneOfVoice: e.target.value as ContentBrief["toneOfVoice"] })
            }
            className={fieldClass}
          >
            <option value="">Select tone</option>
            {TONES_OF_VOICE.map((o) => {
              const allowed = toneAllowed(o.value, brief.primaryIntent, brief.angle);
              return (
                <option key={o.value} value={o.value} disabled={!allowed}>
                  {o.label}
                  {allowed ? "" : " — not compatible with this intent/angle"}
                </option>
              );
            })}
          </select>
          <span className="text-xs font-normal text-muted">
            Internal editorial control (not a Google attribute). Options gated by primary intent
            and angle.
          </span>
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">
            E-E-A-T signals{requiredMark(brief.eeatSignals.length > 0)}
          </p>
          <p className="text-xs text-muted">
            Google Search Quality framework — pick at least one.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EEAT_SIGNALS.map((s) => {
              const on = brief.eeatSignals.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleEeat(s.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    on
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-white text-muted"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">Research &amp; SERP index</p>
        <p className="mt-1 text-xs text-muted">
          Upload saved Keyword SERP / wiki pages — Generate reads ResearchJson. Use{" "}
          <strong>Apply to brief SERP fields</strong> on a Keyword result to fill serpTitles /
          serpUrls (and related) from parsed organics. PAA stays operator-curated.
        </p>

        <div className="mt-3">
          <CreateKeywordUploadPanel
            createId={createId}
            ensureCreateId={ensureCreateId}
            onAddToNotes={(text) => {
              setBrief((prev) => {
                if (prev.writingNotes.includes(text)) return prev;
                const next: ContentBrief = {
                  ...prev,
                  writingNotes: [prev.writingNotes.trim(), text].filter(Boolean).join("\n"),
                };
                persistLocal(next);
                return next;
              });
              setSavedMsg(null);
            }}
            onApplySerpSeed={(seed) => {
              setBrief((prev) => {
                const next = applyCuratedSerpToBrief(prev, seed, "replace");
                persistLocal(next);
                return next;
              });
              setSavedMsg("SERP fields updated from upload — save the brief to persist for Generate.");
            }}
          />
        </div>

        <label className={`${labelClass} mt-4`}>
          Organic titles (one per line)
          <textarea
            value={brief.serpTitles}
            onChange={(e) => patch({ serpTitles: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          Organic URLs (one per line, optional)
          <textarea
            value={brief.serpUrls}
            onChange={(e) => patch({ serpUrls: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          People Also Ask (one per line)
          <textarea
            value={brief.paaQuestions}
            onChange={(e) => patch({ paaQuestions: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          Related searches (one per line)
          <textarea
            value={brief.relatedSearches}
            onChange={(e) => patch({ relatedSearches: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </label>
      </div>

      <label className={`${labelClass} mt-5`}>
        Writing notes (optional)
        <textarea
          value={brief.writingNotes}
          onChange={(e) => patch({ writingNotes: e.target.value })}
          rows={2}
          className={fieldClass}
        />
      </label>

      {!complete ? (
        <p className="mt-4 text-sm text-amber-800">
          Missing required: {missing.join(", ")}. Generate stays disabled until these are filled
          and the brief is saved.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSaveBrief}
          disabled={isSaving || !complete}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save brief for generate"}
        </button>
        {createId ? (
          <span className="text-xs text-muted">Create {createId.slice(0, 8)}…</span>
        ) : null}
        {savedMsg ? <span className="text-sm text-green-700">{savedMsg}</span> : null}
        {error ? <span className="text-sm text-red-600 whitespace-pre-wrap">{error}</span> : null}
      </div>
    </div>
  );
}
