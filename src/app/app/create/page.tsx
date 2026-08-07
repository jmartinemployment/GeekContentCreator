"use client";

import { Suspense } from "react";
import CreateStartForm from "@/components/content-writer/CreateStartForm";

export default function CreateStartPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted">
          Loading…
        </div>
      }
    >
      <CreateStartForm />
    </Suspense>
  );
}
