import Link from "next/link";
import { listCreates } from "@/lib/geek-api";

export default async function AppHomePage() {
  let creates: Awaited<ReturnType<typeof listCreates>> = [];
  let error: string | null = null;
  try {
    creates = await listCreates();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load creates";
  }

  const recent = creates.slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Home
      </h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Start from a content gap or pick starting content. Pillar is optional.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/app/create"
          className="rounded-md bg-[var(--gcc-teal)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--gcc-teal-deep)]"
        >
          New create
        </Link>
        <Link
          href="/app/site-analyzer"
          className="rounded-md border border-[var(--gcc-line)] bg-white px-4 py-2.5 text-sm font-semibold hover:border-[var(--gcc-teal)]"
        >
          Site Analyzer
        </Link>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">Recent creates</h2>
          <Link href="/app/creates" className="text-sm text-[var(--gcc-teal-deep)] hover:underline">
            View all
          </Link>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-red-700">{error}</p>
        ) : recent.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--gcc-muted)]">No creates yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--gcc-line)] border border-[var(--gcc-line)] bg-white">
            {recent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/creates/${c.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--gcc-paper)]"
                >
                  <div>
                    <p className="font-medium">{c.topic || "(untitled)"}</p>
                    <p className="text-xs text-[var(--gcc-muted)]">
                      {c.startingContentType} · {c.status}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--gcc-muted)]">
                    {new Date(c.createdAtUtc).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
