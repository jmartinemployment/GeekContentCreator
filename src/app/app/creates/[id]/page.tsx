"use client";

import { useParams } from "next/navigation";
import CreateDraftWorkspace from "@/components/content-writer/CreateDraftWorkspace";

/**
 * Content Creator draft workspace — revise / SEO / polish / approve
 * against GeekAPI create artifacts (not CWV2 project fields).
 */
export default function CreateWorkspacePage() {
  const params = useParams<{ id: string }>();
  return <CreateDraftWorkspace createId={params.id} />;
}
