import { redirect } from "next/navigation";

/** Legacy create workspace — redirect to CWV2 Projects. */
export default async function CreateWorkspaceRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect("/app");
}
