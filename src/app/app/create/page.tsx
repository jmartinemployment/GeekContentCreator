import { redirect } from "next/navigation";
import { createCreate, listClients } from "@/lib/geek-api";
import { STARTING_CONTENT_TYPES } from "@/lib/config";
import type { SiteSectionContext } from "@/lib/types";
import { SiteContextBanner } from "@/components/SiteContextBanner";
import { CreateForm } from "./create-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const topic = first(sp.topic);
  const notes = first(sp.notes);
  const startingContentType = first(sp.startingContentType) || "blog";
  const siteAnalysisId = first(sp.siteAnalysisId) || null;
  const siteSectionRaw = first(sp.siteSection);

  let siteSection: SiteSectionContext | null = null;
  if (siteSectionRaw) {
    try {
      siteSection = JSON.parse(siteSectionRaw) as SiteSectionContext;
    } catch {
      siteSection = null;
    }
  }

  let clients: { id: string; name: string }[] = [];
  let clientsError: string | null = null;
  try {
    clients = (await listClients()).map((c) => ({ id: c.id, name: c.name }));
  } catch (e) {
    clientsError = e instanceof Error ? e.message : "Could not load clients";
  }

  async function createAction(formData: FormData) {
    "use server";
    const clientId = String(formData.get("clientId") || "");
    const type = String(formData.get("startingContentType") || "");
    const topicVal = String(formData.get("topic") || "").trim();
    const notesVal = String(formData.get("notes") || "").trim();
    const toolNamesExtra = String(formData.get("toolNames") || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const analysisId = String(formData.get("siteAnalysisId") || "").trim() || null;
    const sectionJson = String(formData.get("siteSectionJson") || "").trim();

    if (!clientId) {
      redirect(`/app/create?error=${encodeURIComponent("Pick a client")}`);
    }
    if (!STARTING_CONTENT_TYPES.includes(type as (typeof STARTING_CONTENT_TYPES)[number])) {
      redirect(`/app/create?error=${encodeURIComponent("Invalid starting content type")}`);
    }
    if (!topicVal) {
      redirect(`/app/create?error=${encodeURIComponent("Topic / keyword is required")}`);
    }
    if (type === "imagePrompt" && !notesVal) {
      redirect(
        `/app/create?error=${encodeURIComponent("Standalone image prompt requires topic and notes")}`,
      );
    }
    if (type === "aiTool" && !notesVal) {
      redirect(
        `/app/create?error=${encodeURIComponent("AI Tool create requires a short brief in notes")}`,
      );
    }

    let notesOut = notesVal || null;
    if (type === "aiTool" && toolNamesExtra.length > 0) {
      notesOut = `${notesVal}\n\nAdditional tools: ${toolNamesExtra.join(", ")}`;
    }

    let section: SiteSectionContext | null = null;
    if (sectionJson) {
      try {
        section = JSON.parse(sectionJson) as SiteSectionContext;
      } catch {
        redirect(`/app/create?error=${encodeURIComponent("Invalid site section JSON")}`);
      }
    }

    if (analysisId && (!section?.relatedPages || section.relatedPages.length === 0)) {
      redirect(
        `/app/create?error=${encodeURIComponent("Site Analyzer create requires related pages in site section context")}`,
      );
    }

    const created = await createCreate({
      clientId,
      startingContentType: type,
      topic: topicVal,
      notes: notesOut,
      siteAnalysisId: analysisId,
      siteSection: section,
    });
    redirect(`/app/creates/${created.id}`);
  }

  const error = first(sp.error);

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="font-display text-3xl font-semibold">Starting content</h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Choose what to write. Pillar is optional. Image prompt is a valid starting type.
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {clientsError ? (
        <p className="mt-4 text-sm text-amber-800">
          Clients unavailable ({clientsError}). You can still try after GeekAPI is up.
        </p>
      ) : null}

      <div className="mt-6">
        <SiteContextBanner siteSection={siteSection} />
      </div>

      <CreateForm
        action={createAction}
        clients={clients}
        defaultType={startingContentType}
        defaultTopic={topic}
        defaultNotes={notes}
        siteAnalysisId={siteAnalysisId}
        siteSectionJson={siteSection ? JSON.stringify(siteSection) : ""}
      />
    </div>
  );
}
