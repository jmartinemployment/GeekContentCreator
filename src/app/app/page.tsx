"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ClientsPanel from "@/components/content-writer/ClientsPanel";
import ProjectForm from "@/components/content-writer/ProjectForm";
import ProjectList from "@/components/content-writer/ProjectList";
import { getClients, getRecentProjects } from "@/lib/content-writer/api";
import type { Client, ProjectSummary } from "@/lib/content-writer/types";

/**
 * Content Writer v2 dashboard (source: content-writer-v2 frontend page.tsx).
 * Content Creator additions (Site Analyzer, etc.) hang off this base.
 */
function DashboardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gapTopic = searchParams.get("topic")?.trim() ?? "";
  const projectUrlHint = searchParams.get("projectUrl")?.trim() ?? "";
  const suggestPillar = searchParams.get("suggestPillar") === "1";

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getClients(), getRecentProjects()])
      .then(([clientList, projectList]) => {
        setClients(clientList);
        setProjects(projectList);
        if (clientList.length > 0) setSelectedClientId(clientList[0].id);
      })
      .catch((e) =>
        setLoadError(
          e instanceof Error
            ? e.message
            : "Could not reach the Content Writer API.",
        ),
      );
  }, []);

  function handleClientCreated(client: Client) {
    setClients((prev) => [...prev, client]);
    setSelectedClientId(client.id);
  }

  function handleProjectCreated(project: ProjectSummary) {
    setProjects((prev) => [project, ...prev]);
    router.push(`/app/projects/${project.id}`);
  }

  const clientProjects = projects.filter((p) => p.clientId === selectedClientId);
  const initialName = gapTopic
    ? suggestPillar
      ? `${gapTopic} (pillar)`
      : gapTopic
    : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Geek Content Creator
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Projects</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Legacy Content Writer v2 projects (clients / crawl). Happy path for
          writing is{" "}
          <a href="/app/creates" className="font-semibold text-brand hover:underline">
            Creates
          </a>{" "}
          — Site Analyzer starts a Content Creator create with site section context.
        </p>
      </div>

      {gapTopic ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Prefer{" "}
          <a
            href={`/app/create?topic=${encodeURIComponent(gapTopic)}${suggestPillar ? "&suggestPillar=1" : ""}`}
            className="font-semibold underline"
          >
            Start create
          </a>{" "}
          for Site Analyzer gaps (site section on the create). This project form
          is the legacy path.
          {suggestPillar ? " Pillar suggested for this gap." : ""}
        </p>
      ) : null}

      {loadError && <p className="mb-6 text-sm text-red-600">{loadError}</p>}

      <div className="flex flex-col gap-6">
        <ClientsPanel
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={setSelectedClientId}
          onCreated={handleClientCreated}
        />

        {selectedClientId && (
          <>
            <ProjectForm
              key={`${selectedClientId}-${gapTopic}-${projectUrlHint}`}
              clientId={selectedClientId}
              initialKeyword={gapTopic}
              initialUrl={projectUrlHint}
              initialName={initialName}
              onCreated={handleProjectCreated}
            />
            <p className="text-sm text-muted">
              Standalone image prompts:{" "}
              <a
                href="/app/create?type=imagePrompt"
                className="font-semibold text-brand hover:underline"
              >
                Start create → Image prompt
              </a>{" "}
              (topic + notes required on the create).
            </p>
            <ProjectList projects={clientProjects} />
          </>
        )}
      </div>
    </div>
  );
}

export default function AppHomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted">
          Loading…
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
