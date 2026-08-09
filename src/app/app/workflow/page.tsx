"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ClientsPanel from "@/components/content-writer/ClientsPanel";
import ProjectForm from "@/components/content-writer/ProjectForm";
import ProjectList from "@/components/content-writer/ProjectList";
import { useWorkflowGate } from "@/components/WorkflowGate";
import { readWorkflowClientHandoff } from "@/lib/site-section-storage";
import { getClients, getRecentProjects } from "@/services/content-writer-api";
import type { Client, ProjectSummary } from "@/lib/types";

export default function WorkflowPage() {
  const router = useRouter();
  const { workflowUnlocked } = useWorkflowGate();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowUnlocked) return;
    let cancelled = false;
    Promise.all([getClients(), getRecentProjects()])
      .then(([clientList, projectList]) => {
        if (cancelled) return;
        setClients(clientList);
        setProjects(projectList);
        const handoff = readWorkflowClientHandoff();
        if (handoff?.clientId && clientList.some((c) => c.id === handoff.clientId)) {
          setSelectedClientId(handoff.clientId);
        } else if (clientList.length > 0) {
          setSelectedClientId(clientList[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not reach the Content Writer API.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [workflowUnlocked]);

  if (!workflowUnlocked) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-muted">
          Workflow is disabled. Run Site Analyzer first to unlock it.{" "}
          <Link href="/app/site-analyzer" className="text-brand hover:underline">
            Go to Site Analyzer
          </Link>
        </p>
      </div>
    );
  }

  function handleClientCreated(client: Client) {
    setClients((prev) => [...prev, client]);
    setSelectedClientId(client.id);
  }

  function handleProjectCreated(project: ProjectSummary) {
    setProjects((prev) => [project, ...prev]);
    router.push(`/app/workflow/projects/${project.id}`);
  }

  const clientProjects = projects.filter((p) => p.clientId === selectedClientId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Content Writer v2
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Workflow</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Crawl a client site, upload research, generate a pillar article + companion
          content, run editorial review, and publish.
        </p>
      </div>

      {loadError ? <p className="mb-6 text-sm text-red-600">{loadError}</p> : null}

      <div className="flex flex-col gap-6">
        <ClientsPanel
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={setSelectedClientId}
          onCreated={handleClientCreated}
        />

        {selectedClientId ? (
          <>
            <ProjectForm clientId={selectedClientId} onCreated={handleProjectCreated} />
            <ProjectList projects={clientProjects} />
          </>
        ) : null}
      </div>
    </div>
  );
}
