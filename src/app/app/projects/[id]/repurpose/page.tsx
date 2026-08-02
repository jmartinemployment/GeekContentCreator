"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  generateBlogContent,
  generateColdOutreachContent,
  generateImagePromptsContent,
  generatePillarBodyContent,
  generatePillarPlanContent,
  generateSocialPack,
  generateToolsFromNames,
  getProject,
  getProjectContentApproval,
  ApiError,
  defaultLlmProvider,
} from "@/lib/content-writer/api";

/**
 * Content Creator Mix chooser on CWV2 projects — after content approval.
 * Social/ads use one pack LLM call (§7). No auto full suite.
 * Approval gate uses GeekAPI only.
 */
export default function ProjectRepurposePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pillar, setPillar] = useState(false);
  const [blog, setBlog] = useState(false);
  const [facebookCount, setFacebookCount] = useState(0);
  const [linkedInCount, setLinkedInCount] = useState(0);
  const [xCount, setXCount] = useState(0);
  const [instagramCount, setInstagramCount] = useState(0);
  const [metaAdsCount, setMetaAdsCount] = useState(0);
  const [googleAdsCount, setGoogleAdsCount] = useState(0);
  const [cold, setCold] = useState(false);
  const [emailCount, setEmailCount] = useState(0);
  const [imagePrompts, setImagePrompts] = useState(false);
  const [aiTools, setAiTools] = useState(false);
  const [toolNames, setToolNames] = useState("");
  const [toolBrief, setToolBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const socialCount =
    facebookCount +
    linkedInCount +
    xCount +
    instagramCount +
    metaAdsCount +
    googleAdsCount;

  useEffect(() => {
    let cancelled = false;
    getProjectContentApproval(projectId)
      .then((res) => {
        if (cancelled) return;
        setAllowed(res.approved);
      })
      .catch((e) => {
        if (cancelled) return;
        setAllowed(false);
        setError(
          e instanceof Error ? e.message : "Could not verify content approval",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (allowed === false) {
      router.replace(`/app/projects/${projectId}`);
    }
  }, [allowed, projectId, router]);

  function run() {
    setError(null);
    setDone([]);
    const names = toolNames
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (
      !pillar &&
      !blog &&
      socialCount === 0 &&
      !cold &&
      emailCount === 0 &&
      !imagePrompts &&
      !aiTools
    ) {
      setError("Pick at least one output type.");
      return;
    }
    if (aiTools && (names.length === 0 || !toolBrief.trim())) {
      setError("AI Tools require names and a brief.");
      return;
    }

    startTransition(async () => {
      try {
        await getProject(projectId);
        const finished: string[] = [];
        if (pillar) {
          await generatePillarPlanContent(projectId);
          await generatePillarBodyContent(projectId);
          finished.push("TechArticle (pillar)");
        }
        if (blog) {
          await generateBlogContent(projectId);
          finished.push("Blog");
        }
        if (socialCount > 0) {
          const pack = await generateSocialPack(projectId, {
            facebookCount,
            linkedInCount,
            xCount,
            instagramCount,
            metaAdsCount,
            googleAdsCount,
            provider: defaultLlmProvider(),
          });
          finished.push(
            `Social/ads pack (${pack.variantCount} variants, ${pack.llmCalls} LLM call)`,
          );
        }
        if (cold || emailCount > 0) {
          // Plan §7: email = 1 × count. Cold outreach is one email path today.
          const n = Math.max(cold ? 1 : 0, emailCount);
          for (let i = 0; i < n; i++) {
            await generateColdOutreachContent(projectId);
          }
          finished.push(n === 1 ? "Email" : `Email × ${n}`);
        }
        if (imagePrompts) {
          await generateImagePromptsContent(projectId);
          finished.push("Image prompts");
        }
        if (aiTools) {
          await generateToolsFromNames(projectId, {
            toolNames: names,
            brief: toolBrief.trim(),
            provider: defaultLlmProvider(),
          });
          finished.push("AI Tools");
        }
        setDone(finished);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Repurpose failed");
      }
    });
  }

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={`/app/projects/${projectId}`}
        className="text-sm text-brand hover:underline"
      >
        &larr; Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Repurpose (Mix)</h1>
      <p className="mt-2 text-sm text-muted">
        Choose types to generate. Social/ads use one pack call for the channel
        counts you set. No auto full suite.
      </p>

      <div className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-6">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={pillar}
            onChange={(e) => setPillar(e.target.checked)}
          />
          TechArticle (pillar plan + body)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={blog}
            onChange={(e) => setBlog(e.target.checked)}
          />
          Blog post
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Social / ads (one pack)
          </p>
          <div className="ml-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["Facebook", facebookCount, setFacebookCount],
                ["LinkedIn", linkedInCount, setLinkedInCount],
                ["X", xCount, setXCount],
                ["Instagram", instagramCount, setInstagramCount],
                ["Meta ads", metaAdsCount, setMetaAdsCount],
                ["Google ads", googleAdsCount, setGoogleAdsCount],
              ] as const
            ).map(([label, value, setValue]) => (
              <label
                key={label}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                <span>{label}</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={value}
                  onChange={(e) =>
                    setValue(Math.max(0, Math.min(5, Number(e.target.value) || 0)))
                  }
                  className="w-14 rounded border border-border px-1 py-0.5 text-right"
                />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <span className="w-40">Email count</span>
          <input
            type="number"
            min={0}
            max={5}
            value={emailCount}
            onChange={(e) =>
              setEmailCount(Math.max(0, Math.min(5, Number(e.target.value) || 0)))
            }
            className="w-14 rounded border border-border px-1 py-0.5 text-right"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={cold}
            onChange={(e) => setCold(e.target.checked)}
          />
          Cold outreach email (counts as email)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={imagePrompts}
            onChange={(e) => setImagePrompts(e.target.checked)}
          />
          Image prompts (attached)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={aiTools}
            onChange={(e) => setAiTools(e.target.checked)}
          />
          AI Tools (names + brief)
        </label>

        {aiTools ? (
          <div className="ml-6 space-y-3 border-l border-border pl-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tool names</span>
              <textarea
                value={toolNames}
                onChange={(e) => setToolNames(e.target.value)}
                rows={2}
                placeholder="One per line"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Brief</span>
              <textarea
                value={toolBrief}
                onChange={(e) => setToolBrief(e.target.value)}
                rows={2}
                placeholder="Audience and angle"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={run}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate selected"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {done.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground">
          {done.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
