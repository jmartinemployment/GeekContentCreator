"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUDIENCE_MODIFIERS,
  AUDIENCE_PRIMARIES,
  BUYING_STAGE_GROUPS,
  BUYING_STAGE_HELPER,
  CONTENT_ANGLES,
  CTA_TYPES,
  SEARCH_INTENTS,
  TOV_PRESETS,
  TOV_SCALES,
  buildToneOfVoiceSummary,
  contentBriefMissingFields,
  emptyContentBrief,
  isContentBriefComplete,
  loadBriefFromStorage,
  saveBriefToStorage,
  type AudienceModifier,
  type ContentBrief,
  type LengthBandKey,
  type TovScaleKey,
} from "@/lib/content-writer/brief-catalog";
import { LENGTH_BAND_OPTIONS } from "@/lib/content-writer/types";
import { ApiError } from "@/lib/content-writer/api";
import {
  GCC_CREATE_STORAGE_PREFIX,
  briefToJson,
  createGccCreate,
  getGccCreate,
  followResearchUrls,
  organicUrlsFromBrief,
  patchBriefResearch,
  serpIndexFromBrief,
} from "@/lib/gcc-api";
import {
  clearSiteSectionHandoff,
  readSiteSectionHandoff,
} from "@/lib/site-section-storage";

export default function ContentBriefPanel({
  clientId,
  targetKeyword,
  createId: createIdProp,
  startingContentType = "blog",
  onBriefSaved,
  onBriefValidityChange,
}: {
  clientId: string;
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
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);

  useEffect(() => {
    if (createIdProp) setCreateId(createIdProp);
  }, [createIdProp]);

  useEffect(() => {
    let cancelled = false;
    const stored = loadBriefFromStorage(targetKeyword || "draft");
    const fromKw = loadBriefFromStorage(`kw:${targetKeyword}`);
    const localBrief = fromKw ?? stored ?? emptyContentBrief();
    setBrief(localBrief);

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
              const parsed = JSON.parse(create.briefJson) as ContentBrief;
              setBrief(parsed);
              saveBriefToStorage(`kw:${targetKeyword}`, parsed);
            } catch {
              /* keep local brief */
            }
            onBriefSaved(cid, true);
          } else {
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
  const tovSummary = useMemo(
    () => buildToneOfVoiceSummary(brief.toneOfVoice),
    [brief.toneOfVoice],
  );

  useEffect(() => {
    if (!hydrated) return;
    onBriefValidityChange(complete);
  }, [hydrated, complete, onBriefValidityChange]);

  function persistLocal(next: ContentBrief) {
    saveBriefToStorage(`kw:${targetKeyword}`, next);
  }

  function patch(partial: Partial<ContentBrief>) {
    setBrief((prev) => {
      const next = { ...prev, ...partial };
      persistLocal(next);
      return next;
    });
    setSavedMsg(null);
  }

  function toggleModifier(value: AudienceModifier) {
    setBrief((prev) => {
      const has = prev.audienceModifiers.includes(value);
      const audienceModifiers = has
        ? prev.audienceModifiers.filter((m) => m !== value)
        : [...prev.audienceModifiers, value];
      const next = { ...prev, audienceModifiers };
      persistLocal(next);
      return next;
    });
    setSavedMsg(null);
  }

  function setTov(key: TovScaleKey, value: number) {
    setBrief((prev) => {
      const next = {
        ...prev,
        toneOfVoice: { ...prev.toneOfVoice, [key]: value },
      };
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
      topic: targetKeyword.trim() || "untitled",
      siteAnalysisId: handoff?.siteAnalysisId ?? null,
      siteSection: handoff?.section ?? null,
    });
    if (handoff) clearSiteSectionHandoff();
    setCreateId(created.id);
    try {
      localStorage.setItem(GCC_CREATE_STORAGE_PREFIX + targetKeyword, created.id);
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

  async function handleFollowUrls() {
    setError(null);
    setResearchMsg(null);
    const urls = organicUrlsFromBrief(brief);
    if (urls.length === 0) {
      setError("Add 1–3 organic URLs (one per line) before following.");
      return;
    }
    setIsFollowing(true);
    try {
      const id = await ensureCreateId();
      // Persist brief first if complete so create stays consistent
      if (isContentBriefComplete(brief)) {
        await patchBriefResearch(id, { briefJson: briefToJson(brief) });
      }
      const updated = await followResearchUrls(
        id,
        urls,
        serpIndexFromBrief(brief),
      );
      setCreateId(updated.id);
      setResearchMsg(
        `Research saved (${urls.length} page${urls.length === 1 ? "" : "s"}).`,
      );
      if (isContentBriefComplete(brief)) onBriefSaved(id, true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Research follow failed.",
      );
    } finally {
      setIsFollowing(false);
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
        Saved on the Content Creator create (GeekAPI). Generate reads server state only — not
        local drafts. Fail closed: Generate stays disabled until required fields are saved.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Intent{requiredMark(!!brief.intent)}
          <select
            value={brief.intent}
            onChange={(e) =>
              patch({ intent: e.target.value as ContentBrief["intent"] })
            }
            className={fieldClass}
          >
            <option value="">Select intent</option>
            {SEARCH_INTENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Buying stage{requiredMark(!!brief.buyingStage)}
          <select
            value={brief.buyingStage}
            onChange={(e) =>
              patch({ buyingStage: e.target.value as ContentBrief["buyingStage"] })
            }
            className={fieldClass}
          >
            <option value="">Select buying stage</option>
            {BUYING_STAGE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">{BUYING_STAGE_HELPER}</span>
        </label>

        <label className={labelClass}>
          Audience{requiredMark(!!brief.audiencePrimary)}
          <select
            value={brief.audiencePrimary}
            onChange={(e) =>
              patch({
                audiencePrimary: e.target.value as ContentBrief["audiencePrimary"],
              })
            }
            className={fieldClass}
          >
            <option value="">Select audience</option>
            {AUDIENCE_PRIMARIES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Audience modifiers (optional)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCE_MODIFIERS.map((m) => {
              const on = brief.audienceModifiers.includes(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => toggleModifier(m.value)}
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
          Audience detail{requiredMark(!!brief.audienceDetail.trim())}
          <textarea
            value={brief.audienceDetail}
            onChange={(e) => patch({ audienceDetail: e.target.value })}
            rows={2}
            placeholder="Concrete segment — detail wins if it conflicts with primary"
            className={fieldClass}
          />
        </label>

        <label className={`${labelClass} sm:col-span-2`}>
          Audience exclude (optional)
          <input
            value={brief.audienceExclude}
            onChange={(e) => patch({ audienceExclude: e.target.value })}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Angle{requiredMark(!!brief.angle)}
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
        </label>

        <label className={labelClass}>
          Call to action{requiredMark(!!brief.ctaType)}
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
        <p className="text-sm font-medium text-foreground">Tone of voice</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOV_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => patch({ toneOfVoice: { ...p.scales } })}
              className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {TOV_SCALES.map((scale) => (
            <label key={scale.key} className="block text-xs text-muted">
              <span className="flex justify-between font-medium text-foreground">
                <span>{scale.left}</span>
                <span>{scale.right}</span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={brief.toneOfVoice[scale.key]}
                onChange={(e) => setTov(scale.key, Number(e.target.value))}
                className="mt-1 w-full accent-brand"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Summary: <span className="font-medium">{tovSummary}</span>
        </p>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">
          SERP index + deep research (follow destination URLs)
        </p>
        <p className="mt-1 text-xs text-muted">
          Do not upload Google results HTML. Hand-enter titles/URLs/PAA. Follow ≤3 URLs — any
          fetch/empty extract fails the whole research op.
        </p>
        <label className={`${labelClass} mt-3`}>
          Organic titles (one per line)
          <textarea
            value={brief.serpTitles}
            onChange={(e) => patch({ serpTitles: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          Organic URLs to follow (one per line, max 3)
          <textarea
            value={brief.serpUrls}
            onChange={(e) => patch({ serpUrls: e.target.value })}
            rows={3}
            placeholder="https://example.com/article"
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
        <button
          type="button"
          onClick={handleFollowUrls}
          disabled={isFollowing}
          className="mt-3 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:opacity-50"
        >
          {isFollowing ? "Following URLs…" : "Follow URLs (deep research)"}
        </button>
        {researchMsg ? (
          <p className="mt-2 text-sm text-green-700">{researchMsg}</p>
        ) : null}
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
