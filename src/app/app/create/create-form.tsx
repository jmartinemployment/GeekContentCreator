"use client";

import { useState } from "react";
import { STARTING_CONTENT_TYPES } from "@/lib/config";

const LABELS: Record<string, string> = {
  blog: "Blog post",
  pillar: "Pillar (optional)",
  techArticle: "TechArticle",
  email: "Email / cold email",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  instagram: "Instagram",
  imagePrompt: "Image prompt",
  aiTool: "AI Tool",
};

export function CreateForm({
  action,
  clients,
  defaultType,
  defaultTopic,
  defaultNotes,
  siteAnalysisId,
  siteSectionJson,
}: {
  action: (formData: FormData) => Promise<void>;
  clients: { id: string; name: string }[];
  defaultType: string;
  defaultTopic: string;
  defaultNotes: string;
  siteAnalysisId: string | null;
  siteSectionJson: string;
}) {
  const [type, setType] = useState(defaultType);

  return (
    <form action={action} className="mt-8 space-y-6">
      <input type="hidden" name="siteAnalysisId" value={siteAnalysisId ?? ""} />
      <input type="hidden" name="siteSectionJson" value={siteSectionJson} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Client</span>
        <select
          name="clientId"
          required
          className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          defaultValue={clients[0]?.id ?? ""}
        >
          <option value="" disabled>
            Select client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What to write</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTING_CONTENT_TYPES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm has-[:checked]:border-[var(--gcc-teal)] has-[:checked]:bg-[var(--gcc-teal)]/5"
            >
              <input
                type="radio"
                name="startingContentType"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="accent-[var(--gcc-teal)]"
              />
              {LABELS[t] ?? t}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          {type === "aiTool" ? "Primary tool name / topic" : "Topic / keyword"}
        </span>
        <input
          name="topic"
          required
          defaultValue={defaultTopic}
          className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          placeholder={
            type === "imagePrompt"
              ? "Image title / subject"
              : type === "aiTool"
                ? "e.g. Acme Invoice AI"
                : "e.g. payroll automation for SMBs"
          }
        />
      </label>

      {type === "aiTool" ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Tool names (optional extras)</span>
          <textarea
            name="toolNames"
            rows={2}
            className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
            placeholder="Comma or newline separated — primary topic is always included"
          />
          <span className="text-xs text-[var(--gcc-muted)]">
            Context required. Not gated on an approved Pillar with a Tools section.
          </span>
        </label>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Notes{type === "imagePrompt" || type === "aiTool" ? " (required)" : ""}
        </span>
        <textarea
          name="notes"
          rows={4}
          required={type === "imagePrompt" || type === "aiTool"}
          defaultValue={defaultNotes}
          className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          placeholder={
            type === "imagePrompt"
              ? "Describe the scene, style, and constraints (required for standalone image prompt)"
              : type === "aiTool"
                ? "Short brief / angle for each tool (required)"
                : "Optional freeform notes"
          }
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-[var(--gcc-ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--gcc-slate)]"
      >
        Create
      </button>
    </form>
  );
}
