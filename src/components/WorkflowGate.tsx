"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Session-only Workflow unlock (React memory, not localStorage / sessionStorage).
 * After Analyze, sidebar Workflow is /app/workflow?siteAnalysisProfileId=<crawl id>.
 * ProjectForm reads that query param once.
 */
export type WorkflowUnlockInput = {
  siteAnalysisProfileId: string;
  domain?: string;
  clientId?: string | null;
};

type WorkflowGateValue = {
  workflowUnlocked: boolean;
  siteAnalysisProfileId: string | null;
  domain: string | null;
  clientId: string | null;
  unlockWorkflow: (input: WorkflowUnlockInput) => void;
};

const WorkflowGateContext = createContext<WorkflowGateValue | null>(null);

export function WorkflowGateProvider({ children }: { children: ReactNode }) {
  const [workflowUnlocked, setWorkflowUnlocked] = useState(false);
  const [siteAnalysisProfileId, setSiteAnalysisProfileId] = useState<string | null>(
    null,
  );
  const [domain, setDomain] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const unlockWorkflow = useCallback((input: WorkflowUnlockInput) => {
    const id = input.siteAnalysisProfileId.trim();
    if (!id) return;
    setSiteAnalysisProfileId(id);
    setDomain(input.domain?.trim() || null);
    setClientId(input.clientId?.trim() || null);
    setWorkflowUnlocked(true);
  }, []);
  const value = useMemo(
    () => ({
      workflowUnlocked,
      siteAnalysisProfileId,
      domain,
      clientId,
      unlockWorkflow,
    }),
    [workflowUnlocked, siteAnalysisProfileId, domain, clientId, unlockWorkflow],
  );
  return (
    <WorkflowGateContext.Provider value={value}>
      {children}
    </WorkflowGateContext.Provider>
  );
}

export function useWorkflowGate(): WorkflowGateValue {
  const ctx = useContext(WorkflowGateContext);
  if (!ctx) {
    throw new Error("useWorkflowGate must be used within WorkflowGateProvider");
  }
  return ctx;
}

export function workflowHref(siteAnalysisProfileId: string | null | undefined): string {
  const id = siteAnalysisProfileId?.trim();
  if (!id) return "/app/workflow";
  return `/app/workflow?siteAnalysisProfileId=${encodeURIComponent(id)}`;
}
