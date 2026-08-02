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
  generateSocialContent,
  generateToolsFromNames,
  getProject,
  getProjectContentApproval,
  ApiError,
  defaultLlmProvider,
} from "@/lib/content-writer/api";
import { isContentApproved, setContentApproved } from "@/lib/content-approval";

/**
 * Content Creator Mix chooser on CWV2 projects — after content approval.
 * Runs existing CWV2 generate steps the operator selects (no auto full suite).
 */
export default function ProjectRepurposePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pillar, setPillar] = useState(false);
  const [blog, setBlog] = useState(false);
  const [social, setSocial] = useState(false);
  const [cold, setCold] = useState(false);
  const [imagePrompts, setImagePrompts] = useState(false);
  const [aiTools, setAiTools] = useState(false);
  const [toolNames, setToolNames] = useState("");
  const [toolBrief, setToolBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const local = isContentApproved(projectId);
    setAllowed(local);
    getProjectContentApproval(projectId)
      .then((res) => {
        if (cancelled) return;
        setContentApproved(projectId, res.approved);
        setAllowed(res.approved);
      })
      .catch(() => {
        if (!cancelled) setAllowed(local);
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

    if (!pillar && !blog && !social && !cold && !imagePrompts && !aiTools) {
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
        if (social) {
          await generateSocialContent(projectId);
          finished.push("Social");
        }
        if (cold) {
          await generateColdOutreachContent(projectId);
          finished.push("Cold outreach email");
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
        Choose types to generate from this project. Social and cold outreach work
        from a pillar <em>or</em> standalone blog. AI Tools use names + brief. No
        auto full suite.
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
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={social}
            onChange={(e) => setSocial(e.target.checked)}
          />
          Social posts
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={cold}
            onChange={(e) => setCold(e.target.checked)}
          />
          Cold outreach email
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
          {pending ? "Generating…" : "Generate Mix"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {done.length > 0 ? (
          <p className="text-sm text-green-800">
            Generated: {done.join(", ")}.{" "}
            <Link
              href={`/app/projects/${projectId}`}
              className="font-medium underline"
            >
              View on project
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
