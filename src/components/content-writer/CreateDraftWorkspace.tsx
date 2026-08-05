"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { SiteContextBanner } from "@/components/SiteContextBanner";
import ContentBriefPanel from "@/components/content-writer/ContentBriefPanel";
import CreateAiToolsPanel from "@/components/content-writer/CreateAiToolsPanel";
import { ApiError } from "@/lib/content-writer/api";
import {
  approveGccVersion,
  generateGccCreate,
  GCC_OUTPUT_TYPES,
  getGccCreateDetail,
  listGccVersions,
  parseSiteSectionJson,
  polishGccVersion,
  previewBodyDocument,
  renderArtifactBody,
  reviseGccVersion,
  seoGccVersion,
  type GccArtifact,
  type GccArtifactVersion,
  type GccCreateDetail,
  type GccPolishReport,
  type GccSeoReport,
} from "@/lib/gcc-api";

export default function CreateDraftWorkspace({ createId }: { createId: string }) {
  const [detail, setDetail] = useState<GccCreateDetail | null>(null);
  const [artifact, setArtifact] = useState<GccArtifact | null>(null);
  const [version, setVersion] = useState<GccArtifactVersion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [briefFormComplete, setBriefFormComplete] = useState(false);
  const [briefSavedOnServer, setBriefSavedOnServer] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [outputTypes, setOutputTypes] = useState<string[]>([]);

  // Seed the checked set from the create's starting type once the detail loads;
  // never clobber a selection the operator has already made.
  useEffect(() => {
    if (!detail) return;
    setOutputTypes((prev) => {
      if (prev.length) return prev;
      const t = detail.startingContentType;
      return GCC_OUTPUT_TYPES.some((o) => o.value === t) ? [t] : ["blog"];
    });
  }, [detail]);

  const [feedback, setFeedback] = useState("");
  const [scope, setScope] = useState<"full" | "section">("full");
  const [sectionPath, setSectionPath] = useState("");
  const [seo, setSeo] = useState<GccSeoReport | null>(null);
  const [polish, setPolish] = useState<GccPolishReport | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await getGccCreateDetail(createId);
      setDetail(d);
      setBriefSavedOnServer(!!d.briefJson);
      const primary =
        d.artifacts.find((a) =>
          ["blog", "pillar", "techarticle", "technicalarticle"].includes(
            a.type.toLowerCase(),
          ),
        ) ?? d.artifacts[0] ?? null;
      setArtifact(primary);
      if (!primary) {
        setVersion(null);
        return;
      }
      const versions = await listGccVersions(primary.id);
      const latest =
        [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
      setVersion(latest);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not load create.",
      );
    }
  }, [createId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function run(label: string, fn: () => Promise<void>) {
    setActionError(null);
    setActionMsg(null);
    startTransition(async () => {
      try {
        await fn();
        setActionMsg(label);
      } catch (err) {
        setActionError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Action failed.",
        );
      }
    });
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link href="/app" className="mt-4 inline-block text-sm text-brand hover:underline">
          &larr; Back to dashboard
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-muted">Loading create…</p>
      </div>
    );
  }

  const briefReady = !!detail.briefJson || briefSavedOnServer;
  const researchReady = !!detail.researchJson;
  const approved = artifact?.status?.toLowerCase() === "approved";
  const siteSection = parseSiteSectionJson(detail.siteSectionJson);
  const canGenerate = briefFormComplete && briefReady;
  const saMissingPages =
    !!detail.siteAnalysisId && (!siteSection || !siteSection.relatedPages.length);

  async function runGenerate() {
    if (!canGenerate || saMissingPages) return;
    setGenerateMsg(null);
    setGenerating(true);
    try {
      const result = await generateGccCreate(createId, { outputTypes });
      if (result.artifact && result.version) {
        setGenerateMsg(
          `Created ${result.artifact.type} “${result.artifact.name}” v${result.version.versionNumber}.`,
        );
      } else if (result.created?.length) {
        setGenerateMsg(`Generated ${result.created.length} artifact(s).`);
      } else {
        setGenerateMsg("Generate finished.");
      }
      await reload();
    } catch (err) {
      setGenerateMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Generate failed",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/app/creates" className="text-sm text-brand hover:underline">
        &larr; Back to creates
      </Link>

      <div className="mb-8 mt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          {detail.startingContentType}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{detail.topic}</h1>
        <p className="mt-2 text-sm text-muted">
          Create {detail.id}
          {briefReady ? " · brief saved" : " · brief missing"}
          {researchReady ? " · research saved" : ""}
          {detail.siteAnalysisId ? " · Site Analyzer" : ""}
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-6">
        {siteSection ? <SiteContextBanner siteSection={siteSection} /> : null}
        {saMissingPages ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Site Analyzer create is missing related pages — Generate stays blocked
            (no keyword-only path).
          </p>
        ) : null}

        <ContentBriefPanel
          clientId={detail.clientId}
          targetKeyword={detail.topic}
          createId={createId}
          startingContentType={detail.startingContentType}
          onBriefValidityChange={setBriefFormComplete}
          onBriefSaved={(_id, ok) => {
            setBriefSavedOnServer(ok);
            void reload();
          }}
        />

        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Generate (Content Creator)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Reads persisted BriefJson / ResearchJson (and site section) from the
            database only. Check every content item to generate — one long-form is
            produced, the rest are derived from it.
          </p>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-foreground">Content items to generate</legend>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {GCC_OUTPUT_TYPES.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={outputTypes.includes(o.value)}
                    onChange={(e) =>
                      setOutputTypes((prev) =>
                        e.target.checked
                          ? [...prev, o.value]
                          : prev.filter((v) => v !== o.value),
                      )
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={!canGenerate || saMissingPages || generating || outputTypes.length === 0}
            onClick={() => void runGenerate()}
            className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating
              ? "Generating…"
              : outputTypes.length > 1
                ? `Generate ${outputTypes.length} content items`
                : "Generate content"}
          </button>
          {!canGenerate ? (
            <p className="mt-2 text-xs text-muted">
              Disabled until Content Brief is saved — inline required markers above.
            </p>
          ) : null}
          {generateMsg ? (
            <p className="mt-2 text-sm whitespace-pre-wrap">{generateMsg}</p>
          ) : null}
        </section>

        <CreateAiToolsPanel
          createId={createId}
          artifacts={detail.artifacts}
          onGenerated={() => void reload()}
        />
      </div>

      {!version ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No draft artifact yet. Save the Content Brief, then Generate above.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              {artifact?.name || "Draft"}
              {" · "}v{version.versionNumber}
              {approved ? " · approved" : ""}
            </h2>
            <p className="mt-1 text-sm text-muted">{artifact?.type}</p>
            <ArtifactBody bodyDocumentJson={version.bodyDocumentJson} />
          </section>

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Revise</h2>
            <p className="mt-1 text-sm text-muted">
              Full or Section — each submit creates a new version (not a chat thread).
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="What should change in this draft?"
            />
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={scope === "full"}
                  onChange={() => setScope("full")}
                />
                Full
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={scope === "section"}
                  onChange={() => setScope("section")}
                />
                Section
              </label>
            </div>
            {scope === "section" ? (
              <input
                value={sectionPath}
                onChange={(e) => setSectionPath(e.target.value)}
                placeholder='e.g. "Key Capabilities"'
                className="mt-3 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            ) : null}
            <button
              type="button"
              disabled={pending || !feedback.trim() || (scope === "section" && !sectionPath.trim())}
              onClick={() =>
                run("Revised — new version saved.", async () => {
                  if (!version) return;
                  if (scope === "section" && !sectionPath.trim()) {
                    throw new Error("Section path required for section revise.");
                  }
                  const next = await reviseGccVersion(version.id, {
                    feedback: feedback.trim(),
                    scope,
                    sectionPath: scope === "section" ? sectionPath.trim() : null,
                  });
                  setVersion(next);
                  setSeo(null);
                  setPolish(null);
                  await reload();
                })
              }
              className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : "Revise"}
            </button>
          </section>

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              On-page SEO &amp; polish
            </h2>
            <p className="mt-1 text-sm text-muted">
              Draft + target keyword only — no research dossier.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending || !version}
                onClick={() =>
                  run("SEO report ready.", async () => {
                    if (!version || !detail) return;
                    setSeo(await seoGccVersion(version.id, detail.topic));
                  })
                }
                className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-50"
              >
                Run SEO
              </button>
              <button
                type="button"
                disabled={pending || !version}
                onClick={() =>
                  run("Polish report ready.", async () => {
                    if (!version) return;
                    setPolish(await polishGccVersion(version.id));
                  })
                }
                className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-50"
              >
                Run polish
              </button>
            </div>
            {seo ? (
              <div className="mt-4 text-sm">
                <p className="font-medium">
                  SEO score {seo.score} · {seo.wordCount} words · density{" "}
                  {seo.keywordDensityPercent.toFixed(1)}%
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  {seo.checks.map((c) => (
                    <li key={c.id}>
                      {c.passed ? "✓" : "✗"} {c.label}: {c.detail}
                    </li>
                  ))}
                </ul>
                {seo.applyFeedback ? (
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-brand hover:underline"
                    onClick={() => {
                      setFeedback(seo.applyFeedback);
                      setScope("full");
                    }}
                  >
                    Copy SEO fixes into revise
                  </button>
                ) : null}
              </div>
            ) : null}
            {polish ? (
              <div className="mt-4 text-sm">
                <p className="font-medium">
                  Polish score {polish.score}
                  {polish.shipReady ? " · ship-ready heuristic" : ""}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  {polish.checks.map((c) => (
                    <li key={c.id}>
                      {c.passed ? "✓" : "✗"} {c.label}: {c.detail}
                    </li>
                  ))}
                </ul>
                {polish.applyFeedback ? (
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-brand hover:underline"
                    onClick={() => {
                      setFeedback(polish.applyFeedback);
                      setScope("full");
                    }}
                  >
                    Copy polish fixes into revise
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Content approval</h2>
            <p className="mt-1 text-sm text-muted">
              Approval is on the create artifact (GeekAPI) — required before Repurpose.
            </p>
            {approved ? (
              <p className="mt-4 text-sm font-medium text-green-800">Content approved.</p>
            ) : (
              <button
                type="button"
                disabled={pending || !version}
                onClick={() =>
                  run("Approved.", async () => {
                    if (!version) return;
                    await approveGccVersion(version.id);
                    await reload();
                  })
                }
                className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                Approve content
              </button>
            )}
            {approved ? (
              <Link
                href={`/app/creates/${createId}/repurpose`}
                className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
              >
                Open Repurpose (Mix) →
              </Link>
            ) : null}
          </section>
        </div>
      )}

      {actionError ? (
        <p className="mt-4 text-sm text-red-600 whitespace-pre-wrap">{actionError}</p>
      ) : null}
      {actionMsg ? (
        <p className="mt-4 text-sm text-green-700">{actionMsg}</p>
      ) : null}
    </div>
  );
}

/**
 * Render an artifact body as readable content (CWV2 ContentDocument → HTML, or labeled
 * fields for image-prompt/tool artifacts). Raw JSON is available behind a collapsed toggle
 * for debugging — never the default view.
 */
function ArtifactBody({ bodyDocumentJson }: { bodyDocumentJson: string }) {
  const [showSource, setShowSource] = useState(false);
  const html = renderArtifactBody(bodyDocumentJson);

  return (
    <div className="mt-4">
      {html ? (
        <div
          className="gcc-doc max-h-[32rem] overflow-auto rounded-md border border-border bg-white p-5 text-sm text-foreground [&_a]:text-brand [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-3 [&_p]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-white p-4 text-sm text-foreground">
          {previewBodyDocument(bodyDocumentJson, 8000)}
        </pre>
      )}

      <button
        type="button"
        onClick={() => setShowSource((v) => !v)}
        className="mt-2 text-xs text-muted underline"
      >
        {showSource ? "Hide source" : "View source (JSON)"}
      </button>
      {showSource ? (
        <pre className="mt-2 max-h-[20rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-muted p-3 text-xs text-muted">
          {bodyDocumentJson}
        </pre>
      ) : null}
    </div>
  );
}
