import Link from "next/link";
import { redirect } from "next/navigation";
import { getCreate, listVersions, repurposeVersion } from "@/lib/geek-api";
import { RepurposeForm } from "./repurpose-form";

type Params = Promise<{ id: string }>;

export default async function RepurposePage({ params }: { params: Params }) {
  const { id } = await params;
  const create = await getCreate(id);
  const approved = create.artifacts.find((a) => a.status === "approved");
  if (!approved) {
    redirect(
      `/app/creates/${id}?error=${encodeURIComponent("Content approval required before Repurpose")}`,
    );
  }

  const versions = await listVersions(approved.id);
  const latest = versions[0];
  if (!latest) {
    redirect(`/app/creates/${id}?error=${encodeURIComponent("No approved version")}`);
  }

  async function mixAction(formData: FormData) {
    "use server";
    const blog = formData.get("blog") === "on";
    const techArticle = formData.get("techArticle") === "on";
    const imagePrompts = formData.get("imagePrompts") === "on";
    const emailCount = Number(formData.get("emailCount") || 0);
    const linkedInCount = Number(formData.get("linkedInCount") || 0);
    const xCount = Number(formData.get("xCount") || 0);
    const instagramCount = Number(formData.get("instagramCount") || 0);
    const metaAdsCount = Number(formData.get("metaAdsCount") || 0);
    const googleAdsCount = Number(formData.get("googleAdsCount") || 0);
    const toolNamesRaw = String(formData.get("aiToolNames") || "");
    const aiToolNames = toolNamesRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const aiToolBrief = String(formData.get("aiToolBrief") || "").trim() || null;

    try {
      await repurposeVersion(latest.id, {
        blog,
        techArticle,
        emailCount,
        linkedInCount,
        xCount,
        instagramCount,
        metaAdsCount,
        googleAdsCount,
        aiToolNames: aiToolNames.length ? aiToolNames : undefined,
        aiToolBrief,
        imagePrompts,
        provider: "OpenAi",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Repurpose failed";
      redirect(`/app/creates/${id}/repurpose?error=${encodeURIComponent(msg)}`);
    }
    redirect(`/app/creates/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/app/creates/${id}`}
        className="text-sm text-[var(--gcc-teal-deep)] hover:underline"
      >
        ← Back to create
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Repurpose</h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Mix chooser — pick types and counts. No auto full suite. From approved:{" "}
        {approved.name}.
      </p>
      <RepurposeForm action={mixAction} />
    </div>
  );
}
