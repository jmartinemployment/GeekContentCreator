"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  generateBlogContent,
  generateColdOutreachContent,
  generateImagePromptsContent,
  generateSocialContent,
  getProject,
  ApiError,
} from "@/lib/content-writer/api";

const storageKey = (projectId: string) => `gcc.contentApproved.${projectId}`;

/**
 * Content Creator Mix chooser on CWV2 projects — after content approval.
 * Runs existing CWV2 generate steps the operator selects (no auto full suite).
 */
export default function ProjectRepurposePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [blog, setBlog] = useState(true);
  const [social, setSocial] = useState(false);
  const [cold, setCold] = useState(false);
  const [imagePrompts, setImagePrompts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setAllowed(sessionStorage.getItem(storageKey(projectId)) === "1");
    } catch {
      setAllowed(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (allowed === false) {
      router.replace(`/app/projects/${projectId}`);
    }
  }, [allowed, projectId, router]);

  function run() {
    setError(null);
    setDone([]);
    if (!blog && !social && !cold && !imagePrompts) {
      setError("Pick at least one output type.");
      return;
    }
    startTransition(async () => {
      try {
        await getProject(projectId);
        const finished: string[] = [];
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
        Choose types to generate from this project. No auto full suite — only what
        you select runs via Content Writer v2 generate.
      </p>

      <div className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-6">
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
