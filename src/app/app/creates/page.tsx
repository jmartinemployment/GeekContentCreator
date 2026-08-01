import Link from "next/link";
import { listCreates } from "@/lib/geek-api";

export default async function CreatesListPage() {
  let creates: Awaited<ReturnType<typeof listCreates>> = [];
  let error: string | null = null;
  try {
    creates = await listCreates();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Creates</h1>
        <Link
          href="/app"
          className="rounded-md bg-[var(--gcc-teal)] px-3 py-2 text-sm font-semibold text-white"
        >
          New project
        </Link>
      </div>
      {error ? (
        <p className="mt-6 text-sm text-red-700">{error}</p>
      ) : creates.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--gcc-muted)]">No creates yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--gcc-line)] border border-[var(--gcc-line)] bg-white">
          {creates.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/creates/${c.id}`}
                className="block px-4 py-3 hover:bg-[var(--gcc-paper)]"
              >
                <p className="font-medium">{c.topic}</p>
                <p className="text-xs text-[var(--gcc-muted)]">
                  {c.startingContentType}
                  {c.siteAnalysisId ? " · Site Analyzer" : ""} · {c.status}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
