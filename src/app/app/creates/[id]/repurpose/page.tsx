"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/services/content-writer-api";
import {
  getGccCreateDetail,
  listGccVersions,
  repurposeGccVersion,
  type GccArtifact,
  type GccArtifactVersion,
} from "@/services/gcc-api";

/**
 * Mix / Repurpose chooser for Content Creator creates.
 * Requires content approval on the create artifact — GeekAPI only, no local soft gate.
 */
export default function CreateRepurposePage() {
  const params = useParams<{ id: string }>();
  const createId = params.id;
  const router = useRouter();

  const [version, setVersion] = useState<GccArtifactVersion | null>(null);
  const [artifact, setArtifact] = useState<GccArtifact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [blog, setBlog] = useState(false);
  const [techArticle, setTechArticle] = useState(false);
  const [emailCount, setEmailCount] = useState(0);
  const [linkedInCount, setLinkedInCount] = useState(0);
  const [xCount, setXCount] = useState(0);
  const [instagramCount, setInstagramCount] = useState(0);
  const [metaAdsCount, setMetaAdsCount] = useState(0);
  const [googleAdsCount, setGoogleAdsCount] = useState(0);
  const [imagePrompts, setImagePrompts] = useState(false);
  const [toolNames, setToolNames] = useState("");
  const [toolBrief, setToolBrief] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const detail = await getGccCreateDetail(createId);
      const primary = detail.artifacts[0] ?? null;
      if (!primary) {
        setLoadError("No artifact to repurpose — generate and approve first.");
        return;
      }
      if (primary.status.toLowerCase() !== "approved") {
        setLoadError("Content approval required before Repurpose.");
        return;
      }
      const versions = await listGccVersions(primary.id);
      const latest =
        [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
      if (!latest) {
        setLoadError("Approved artifact has no versions.");
        return;
      }
      setArtifact(primary);
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
    void load();
  }, [load]);

  function run() {
    if (!version) return;
    setError(null);
    setDone(null);
    const names = toolNames
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const pack =
      linkedInCount + xCount + instagramCount + metaAdsCount + googleAdsCount;
    if (
      !blog &&
      !techArticle &&
      emailCount === 0 &&
      pack === 0 &&
      !imagePrompts &&
      names.length === 0
    ) {
      setError("Pick at least one output type.");
      return;
    }
    if (names.length > 0 && !toolBrief.trim()) {
      setError("AI Tools require a short brief when using name list.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await repurposeGccVersion(version.id, {
          blog,
          techArticle,
          emailCount,
          linkedInCount,
          xCount,
          instagramCount,
          metaAdsCount,
          googleAdsCount,
          imagePrompts,
          aiToolNames: names.length ? names : null,
          aiToolBrief: names.length ? toolBrief.trim() : null,
        });
        const n = result.created?.length ?? 0;
        setDone(`Repurpose finished — ${n} artifact${n === 1 ? "" : "s"} created.`);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Repurpose failed",
        );
      }
    });
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          className="mt-4 text-sm text-brand hover:underline"
          onClick={() => router.push(`/app/creates/${createId}`)}
        >
          &larr; Back to create
        </button>
      </div>
    );
  }

  if (!version || !artifact) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted">Loading Mix…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/app/creates/${createId}`}
        className="text-sm text-brand hover:underline"
      >
        &larr; Back to create
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Repurpose (Mix)</h1>
      <p className="mt-2 text-sm text-muted">
        From approved {artifact.type} “{artifact.name}” v{version.versionNumber}. Human
        chooses types + counts — no auto full suite.
      </p>

      <div className="mt-8 space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={blog} onChange={(e) => setBlog(e.target.checked)} />
          Blog post
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={techArticle}
            onChange={(e) => setTechArticle(e.target.checked)}
          />
          TechArticle
        </label>
        <label className="flex items-center gap-2">
          Email count
          <input
            type="number"
            min={0}
            max={5}
            value={emailCount}
            onChange={(e) => setEmailCount(Number(e.target.value) || 0)}
            className="w-16 rounded border border-border px-2 py-1"
          />
        </label>
        {(
          [
            ["LinkedIn", linkedInCount, setLinkedInCount],
            ["X", xCount, setXCount],
            ["Instagram", instagramCount, setInstagramCount],
            ["Meta ads", metaAdsCount, setMetaAdsCount],
            ["Google ads", googleAdsCount, setGoogleAdsCount],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="flex items-center gap-2">
            {label}
            <input
              type="number"
              min={0}
              max={5}
              value={value}
              onChange={(e) => set(Number(e.target.value) || 0)}
              className="w-16 rounded border border-border px-2 py-1"
            />
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={imagePrompts}
            onChange={(e) => setImagePrompts(e.target.checked)}
          />
          Image prompts (from approved artifact)
        </label>
        <div>
          <p className="font-medium">AI Tools (optional name list)</p>
          <textarea
            value={toolNames}
            onChange={(e) => setToolNames(e.target.value)}
            rows={3}
            placeholder="One per line"
            className="mt-1 w-full rounded-md border border-border px-3 py-2"
          />
          <textarea
            value={toolBrief}
            onChange={(e) => setToolBrief(e.target.value)}
            rows={2}
            placeholder="Audience and angle"
            className="mt-2 w-full rounded-md border border-border px-3 py-2"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="mt-6 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate Mix"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {done ? <p className="mt-3 text-sm text-green-700">{done}</p> : null}
    </div>
  );
}
