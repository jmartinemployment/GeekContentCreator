import { redirect } from "next/navigation";

export default async function CreateRepurposeRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect("/app");
}
