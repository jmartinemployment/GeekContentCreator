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
 * Session-only Workflow unlock: starts locked on every app load.
 * Unlocks only after Site Analyzer succeeds in this session — not localStorage, not prior DB runs.
 */
type WorkflowGateValue = {
  workflowUnlocked: boolean;
  unlockWorkflow: () => void;
};

const WorkflowGateContext = createContext<WorkflowGateValue | null>(null);

export function WorkflowGateProvider({ children }: { children: ReactNode }) {
  const [workflowUnlocked, setWorkflowUnlocked] = useState(false);
  const unlockWorkflow = useCallback(() => setWorkflowUnlocked(true), []);
  const value = useMemo(
    () => ({ workflowUnlocked, unlockWorkflow }),
    [workflowUnlocked, unlockWorkflow],
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
