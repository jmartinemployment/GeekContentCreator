"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { WorkflowGateProvider } from "@/components/WorkflowGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkflowGateProvider>
      <div className="flex min-h-screen bg-[var(--gcc-paper)] text-[var(--gcc-ink)]">
        <AppSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </WorkflowGateProvider>
  );
}
