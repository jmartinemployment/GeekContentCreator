"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/content-writer/api";
import {
  approveGccVersion,
  getGccCreateDetail,
  listGccVersions,
  polishGccVersion,
  previewBodyDocument,
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

  const briefReady = !!detail.briefJson;
  const researchReady = !!detail.researchJson;
  const approved = artifact?.status?.toLowerCase() === "approved";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/app" className="text-sm text-brand hover:underline">
        &larr; Back to dashboard
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
        </p>
      </div>

      {!version ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No draft artifact yet. Save the Content Brief and run{" "}
          <strong>Generate (Content Creator)</strong> from the project page — Generate
          stays disabled until the brief is saved (no redirect, no soft path).
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Draft · v{version.versionNumber}
              {approved ? " · approved" : ""}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {artifact?.type} — {artifact?.name}
            </p>
            <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-white p-4 text-sm text-foreground">
              {previewBodyDocument(version.bodyDocumentJson, 8000)}
            </pre>
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
