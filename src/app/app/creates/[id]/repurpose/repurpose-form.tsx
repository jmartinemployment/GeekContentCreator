"use client";

export function RepurposeForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="mt-8 space-y-6">
      <p className="rounded-md border border-[var(--gcc-line)] bg-[var(--gcc-paper)] px-3 py-2 text-xs text-[var(--gcc-muted)]">
        LLM budget: social/ads pack = 1 call · email = 1×count · each AI Tool ≈ 2 · image prompt =
        1. No auto full suite.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Long-form</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="blog" /> Blog post
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="techArticle" /> TechArticle
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="imagePrompts" /> Image prompts (from artifact)
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="col-span-full text-sm font-medium">Counts</legend>
        {(
          [
            ["emailCount", "Email"],
            ["linkedInCount", "LinkedIn"],
            ["xCount", "X / Twitter"],
            ["instagramCount", "Instagram"],
            ["metaAdsCount", "Meta ads"],
            ["googleAdsCount", "Google ads"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="flex items-center justify-between gap-2 text-sm">
            <span>{label}</span>
            <input
              type="number"
              name={name}
              min={0}
              defaultValue={0}
              className="w-20 rounded-md border border-[var(--gcc-line)] px-2 py-1"
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">AI Tools</legend>
        <p className="text-xs text-[var(--gcc-muted)]">
          Context required — supply names (+ brief if no artifact tools). Not gated on a Tools
          section.
        </p>
        <textarea
          name="aiToolNames"
          rows={3}
          placeholder="Tool names, one per line or comma-separated"
          className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
        />
        <input
          name="aiToolBrief"
          placeholder="Short brief / angle"
          className="w-full rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
        />
      </fieldset>

      <button
        type="submit"
        className="rounded-md bg-[var(--gcc-teal)] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Generate Mix
      </button>
    </form>
  );
}
