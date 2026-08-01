import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiToolsPanel } from "@/components/AiToolsPanel";
import { ContentDocumentPreview } from "@/components/ContentDocumentPreview";
import { GenerateControls } from "@/components/GenerateControls";
import { ImagePromptPreview } from "@/components/ImagePromptPreview";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { SiteContextBanner } from "@/components/SiteContextBanner";
import { parseSiteSection } from "@/lib/content-document";
import {
  approveVersion,
  generateImagePrompt,
  generateTools,
  getCreate,
  getVersionPolish,
  getVersionSeo,
  listVersions,
  reviseVersion,
} from "@/lib/geek-api";
import { extractCandidateToolNames } from "@/lib/tool-names";
import type { GccArtifactVersion, PolishReport, SeoReport } from "@/lib/types";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function CreateWorkspacePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const error = first(sp.error);
  const showSeo = first(sp.seo) === "1";
  const showPolish = first(sp.polish) === "1";

  let create: Awaited<ReturnType<typeof getCreate>>;
  try {
    create = await getCreate(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create not found";
    return (
      <div className="mx-auto max-w-2xl px-8 py-10">
        <h1 className="font-display text-2xl font-semibold">Create unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{msg}</p>
        <Link href="/app/creates" className="mt-4 inline-block text-sm text-[var(--gcc-teal-deep)]">
          ← Creates
        </Link>
      </div>
    );
  }
  const siteSection = parseSiteSection(create.siteSectionJson);
  const artifactParam = first(sp.artifactId);
  const primary =
    (artifactParam
      ? create.artifacts.find((a) => a.id === artifactParam)
      : null) ??
    create.artifacts.find((a) => a.type === create.startingContentType) ??
    create.artifacts[0] ??
    null;

  let versions: GccArtifactVersion[] = [];
  if (primary) {
    versions = await listVersions(primary.id).catch(() => []);
  }
  const latest = versions[0] ?? null;

  let seo: SeoReport | null = null;
  let polish: PolishReport | null = null;
  if (latest && showSeo) {
    seo = await getVersionSeo(latest.id, create.topic).catch(() => null);
  }
  if (latest && showPolish) {
    polish = await getVersionPolish(latest.id).catch(() => null);
  }

  async function reviseAction(formData: FormData) {
    "use server";
    const versionId = String(formData.get("versionId") || "");
    const feedback = String(formData.get("feedback") || "").trim();
    const scope = String(formData.get("scope") || "full") as "full" | "section";
    const sectionPath = String(formData.get("sectionPath") || "").trim() || null;
    const provider = String(formData.get("provider") || "OpenAi");
    if (!versionId || !feedback) return;
    if (scope === "section" && !sectionPath) {
      redirect(
        `/app/creates/${id}?error=${encodeURIComponent("Section path required for section revise")}`,
      );
    }
    try {
      await reviseVersion(versionId, {
        feedback,
        scope,
        sectionPath,
        provider,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Revise failed";
      redirect(`/app/creates/${id}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/app/creates/${id}`);
    redirect(`/app/creates/${id}`);
  }

  async function approveAction(formData: FormData) {
    "use server";
    const versionId = String(formData.get("versionId") || "");
    if (!versionId) return;
    try {
      await approveVersion(versionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Approve failed";
      redirect(`/app/creates/${id}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/app/creates/${id}`);
    redirect(`/app/creates/${id}/repurpose`);
  }

  async function applyReportAction(formData: FormData) {
    "use server";
    const versionId = String(formData.get("versionId") || "");
    const feedback = String(formData.get("feedback") || "").trim();
    if (!versionId || !feedback) return;
    try {
      await reviseVersion(versionId, {
        feedback,
        scope: "full",
        provider: "OpenAi",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Apply fixes failed";
      redirect(`/app/creates/${id}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/app/creates/${id}`);
    redirect(`/app/creates/${id}`);
  }

  async function toolsAction(formData: FormData) {
    "use server";
    const brief = String(formData.get("brief") || "").trim() || null;
    const manual = String(formData.get("manualNames") || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const selected = formData.getAll("selectedNames").map(String).filter(Boolean);
    const toolNames = [...new Set([...selected, ...manual])];
    if (toolNames.length === 0) {
      redirect(
        `/app/creates/${id}?error=${encodeURIComponent("AI Tools blocked: provide tool names")}`,
      );
    }
    if (!primary && !brief) {
      redirect(
        `/app/creates/${id}?error=${encodeURIComponent("Brief required when no source artifact")}`,
      );
    }
    try {
      await generateTools({
        createId: id,
        toolNames,
        selectedNames: selected.length ? selected : null,
        brief,
        sourceArtifactId: primary?.id ?? null,
        provider: "OpenAi",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI Tools generate failed";
      redirect(`/app/creates/${id}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/app/creates/${id}`);
    redirect(`/app/creates/${id}`);
  }

  async function attachedImagePromptAction() {
    "use server";
    if (!primary) {
      redirect(
        `/app/creates/${id}?error=${encodeURIComponent("Generate a draft before attached image prompt")}`,
      );
    }
    try {
      await generateImagePrompt({
        createId: id,
        topic: create.topic,
        notes: create.notes,
        sourceArtifactId: primary.id,
        provider: "OpenAi",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image prompt failed";
      redirect(`/app/creates/${id}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/app/creates/${id}`);
    redirect(`/app/creates/${id}`);
  }

  const approved = primary?.status === "approved";
  const candidates = latest
    ? extractCandidateToolNames(latest.bodyDocumentJson)
    : [];
  const isImagePrompt =
    create.startingContentType === "imagePrompt" ||
    primary?.type === "imagePrompt";

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gcc-muted)]">
        Create
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {create.topic}
      </h1>
      <p className="mt-1 text-sm text-[var(--gcc-muted)]">
        Starting: {create.startingContentType} · {create.status}
        {primary ? ` · artifact ${primary.status}` : ""}
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <SiteContextBanner siteSection={siteSection} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <GenerateControls createId={id} />
        {latest ? (
          <>
            <Link
              href={`/app/creates/${id}?seo=1${primary ? `&artifactId=${primary.id}` : ""}`}
              className="rounded-md border border-[var(--gcc-line)] bg-white px-4 py-2 text-sm font-semibold"
            >
              On-page SEO
            </Link>
            <Link
              href={`/app/creates/${id}?polish=1${primary ? `&artifactId=${primary.id}` : ""}`}
              className="rounded-md border border-[var(--gcc-line)] bg-white px-4 py-2 text-sm font-semibold"
            >
              Polish
            </Link>
            <form action={attachedImagePromptAction}>
              <PendingSubmitButton
                pendingLabel="Prompting…"
                className="rounded-md border border-[var(--gcc-line)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Attached image prompt
              </PendingSubmitButton>
            </form>
          </>
        ) : null}
        {approved ? (
          <Link
            href={`/app/creates/${id}/repurpose`}
            className="rounded-md border border-[var(--gcc-teal)] bg-[var(--gcc-teal)]/10 px-4 py-2 text-sm font-semibold text-[var(--gcc-teal-deep)]"
          >
            Repurpose (Mix)
          </Link>
        ) : null}
      </div>

      {create.notes ? (
        <p className="mt-6 text-sm text-[var(--gcc-muted)]">
          <span className="font-medium text-[var(--gcc-ink)]">Notes:</span>{" "}
          {create.notes}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {latest ? (
            isImagePrompt ? (
              <ImagePromptPreview json={latest.bodyDocumentJson} />
            ) : (
              <ContentDocumentPreview bodyDocumentJson={latest.bodyDocumentJson} />
            )
          ) : (
            <p className="rounded-md border border-dashed border-[var(--gcc-line)] bg-white px-4 py-8 text-center text-sm text-[var(--gcc-muted)]">
              No draft yet. Generate to create the first version.
            </p>
          )}

          {latest ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold">Revise</h2>
              <p className="text-sm text-[var(--gcc-muted)]">
                Feedback textarea · choose Full or Section · always a new version.
              </p>
              <form action={reviseAction} className="space-y-3">
                <input type="hidden" name="versionId" value={latest.id} />
                <textarea
                  name="feedback"
                  required
                  rows={4}
                  className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
                  placeholder="What should change?"
                />
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="scope" value="full" defaultChecked />
                    Full
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="scope" value="section" />
                    Section
                  </label>
                </div>
                <input
                  name="sectionPath"
                  placeholder="Section path (when Section)"
                  className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
                />
                <label className="block text-xs text-[var(--gcc-muted)]">
                  Provider
                  <select
                    name="provider"
                    defaultValue="OpenAi"
                    className="mt-1 block w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm text-[var(--gcc-ink)]"
                  >
                    <option value="OpenAi">OpenAI</option>
                    <option value="Anthropic">Claude</option>
                  </select>
                </label>
                <PendingSubmitButton
                  pendingLabel="Revising…"
                  className="rounded-md bg-[var(--gcc-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Revise → new version
                </PendingSubmitButton>
              </form>
            </section>
          ) : null}

          <AiToolsPanel candidateNames={candidates} action={toolsAction} />

          {latest && !approved ? (
            <form action={approveAction}>
              <input type="hidden" name="versionId" value={latest.id} />
              <PendingSubmitButton
                pendingLabel="Approving…"
                className="rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Content approval
              </PendingSubmitButton>
            </form>
          ) : null}
        </div>

        <aside className="space-y-6">
          {seo ? (
            <div className="rounded-md border border-[var(--gcc-line)] bg-white p-4 text-sm">
              <h3 className="font-semibold">On-page SEO</h3>
              <p className="mt-1 text-[var(--gcc-muted)]">
                Score {seo.score} · {seo.wordCount} words · density{" "}
                {seo.keywordDensityPercent.toFixed(2)}%
              </p>
              <ul className="mt-3 space-y-2">
                {seo.checks.map((c) => (
                  <li key={c.id} className={c.passed ? "text-teal-800" : "text-amber-800"}>
                    {c.passed ? "✓" : "○"} {c.label}: {c.detail}
                  </li>
                ))}
              </ul>
              {latest && seo.applyFeedback ? (
                <form action={applyReportAction} className="mt-3">
                  <input type="hidden" name="versionId" value={latest.id} />
                  <input type="hidden" name="feedback" value={seo.applyFeedback} />
                  <button
                    type="submit"
                    className="text-xs font-semibold text-[var(--gcc-teal-deep)] underline"
                  >
                    Apply SEO fixes via revise
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {polish ? (
            <div className="rounded-md border border-[var(--gcc-line)] bg-white p-4 text-sm">
              <h3 className="font-semibold">Polish</h3>
              <p className="mt-1 text-[var(--gcc-muted)]">
                Score {polish.score}
                {polish.shipReady ? " · ship ready" : ""}
              </p>
              <ul className="mt-3 space-y-2">
                {polish.checks.map((c) => (
                  <li key={c.id} className={c.passed ? "text-teal-800" : "text-amber-800"}>
                    {c.passed ? "✓" : "○"} {c.label}
                  </li>
                ))}
              </ul>
              {latest && polish.applyFeedback ? (
                <form action={applyReportAction} className="mt-3">
                  <input type="hidden" name="versionId" value={latest.id} />
                  <input type="hidden" name="feedback" value={polish.applyFeedback} />
                  <button
                    type="submit"
                    className="text-xs font-semibold text-[var(--gcc-teal-deep)] underline"
                  >
                    Apply polish via revise
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-[var(--gcc-line)] bg-white p-4 text-sm">
            <h3 className="font-semibold">Versions</h3>
            {versions.length === 0 ? (
              <p className="mt-2 text-[var(--gcc-muted)]">None yet</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {versions.map((v) => (
                  <li key={v.id} className="text-[var(--gcc-muted)]">
                    v{v.versionNumber}
                    {latest?.id === v.id ? " (latest)" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {create.artifacts.length > 1 ? (
            <div className="rounded-md border border-[var(--gcc-line)] bg-white p-4 text-sm">
              <h3 className="font-semibold">Artifacts</h3>
              <ul className="mt-2 space-y-1">
                {create.artifacts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/app/creates/${id}?artifactId=${a.id}`}
                      className={
                        primary?.id === a.id
                          ? "font-semibold text-[var(--gcc-teal-deep)]"
                          : "text-[var(--gcc-ink)] hover:underline"
                      }
                    >
                      {a.name} · {a.type} · {a.status}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
