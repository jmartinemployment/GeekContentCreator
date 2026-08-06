"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav: { href: string; label: string; match: "exact" | "prefix" }[] = [
  { href: "/app/creates", label: "Creates", match: "prefix" },
  { href: "/app/site-analyzer", label: "Site Analyzer", match: "prefix" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--gcc-line)] bg-[var(--gcc-slate)] px-3 py-5 text-white">
      <Link href="/app/creates" className="mb-8 px-2">
        <span className="font-display text-lg font-semibold leading-tight">
          Geek Content Creator
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const isActive =
            item.match === "exact"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--gcc-teal)] text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 px-2 pt-8">
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="block text-xs text-white/40 hover:text-white/70"
        >
          ← Marketing
        </Link>
      </div>
    </aside>
  );
}
