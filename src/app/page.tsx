import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--gcc-ink)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 20%, var(--gcc-glow), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 80%, rgba(26,36,54,0.9), transparent 50%), linear-gradient(160deg, #071018 0%, #0b1220 45%, #122033 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <p className="font-display text-lg font-semibold tracking-tight">
          Geek Content Creator
        </p>
        <Link
          href="/api/auth/start"
          className="text-sm font-medium text-white/70 transition hover:text-white"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col justify-center px-6 pb-24 pt-10 sm:px-10 lg:px-16">
        <p className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          Geek Content Creator
        </p>
        <h1 className="mt-6 max-w-xl text-xl font-medium leading-snug text-white/90 sm:text-2xl">
          Write from site gaps — grounded in what the site already says.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-white/60">
          Site Analyzer gaps start a create with real site section context. Content
          Brief, deep research, generate, revise, on-page SEO, approve, and Mix —
          pillar optional.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/api/auth/start"
            className="inline-flex items-center justify-center rounded-md bg-[var(--gcc-teal)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--gcc-teal-deep)]"
          >
            Sign in to create
          </Link>
          <Link
            href="/app/creates"
            className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
          >
            Open app
          </Link>
        </div>
      </main>
    </div>
  );
}
